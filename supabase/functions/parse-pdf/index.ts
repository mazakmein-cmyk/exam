import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import JSON5 from "https://esm.sh/json5@2.2.3";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


function cleanJsonText(input: string): string {
  let text = input || "";
  // Remove BOM and zero-width spaces
  text = text.replace(/^\ufeff|\u200b/g, "");
  // Strip code fences if any
  text = text.replace(/```json\s*|```/g, "");
  // Normalize quotes
  text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, "$1");
  return text.trim();
}

async function extractStructuredJson(geminiData: any): Promise<any> {
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const textContent = parts.map((p: any) => p?.text).filter(Boolean).join("\n");
  if (!textContent) throw new Error("Gemini response missing text content");

  let jsonText = cleanJsonText(textContent);

  // Try direct parse
  try {
    return JSON.parse(jsonText);
  } catch (_) { }

  // Try slicing to the outermost JSON object
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const sliced = jsonText.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch (_) {
      // Try with JSON5 to allow minor issues like trailing commas/single quotes
      try {
        return JSON5.parse(sliced);
      } catch (e) {
        // As last resort, try JSON5 on full text
        try {
          return JSON5.parse(jsonText);
        } catch {
          throw e;
        }
      }
    }
  }

  // Fallback to JSON5 on full text
  try {
    return JSON5.parse(jsonText);
  } catch (e) {
    throw new Error(`Could not parse JSON: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let sectionId: string | null = null;
  let pdfUrl: string | null = null;

  try {
    const body = await req.json();
    sectionId = body.sectionId;
    pdfUrl = body.pdfUrl;

    console.log(`[parse-pdf] Starting parse for section ${sectionId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update parsing status to in-progress
    await supabase
      .from("sections")
      .update({
        parsing_status: "in-progress",
        parsing_started_at: new Date().toISOString()
      })
      .eq("id", sectionId);

    console.log(`[parse-pdf] Downloading PDF from storage`);

    // Validate inputs
    if (!pdfUrl) {
      throw new Error("Missing pdfUrl in request body");
    }

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("exam-pdfs")
      .download((pdfUrl as string).replace(`${supabaseUrl}/storage/v1/object/public/exam-pdfs/`, ""));

    if (downloadError) {
      console.error("[parse-pdf] Download error:", downloadError);
      throw new Error(`Failed to download PDF: ${downloadError.message}`);
    }

    // Convert PDF to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Pdf = encodeBase64(new Uint8Array(arrayBuffer));

    console.log(`[parse-pdf] PDF size: ${base64Pdf.length} bytes, calling Gemini API`);

    // Call Gemini API to parse PDF using function calling to guarantee JSON structure
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are an expert exam question parser. Extract ALL questions from this exam PDF with their complete information.

Output a JSON array with this EXACT structure:
{
  "questions": [
    {
      "q_no": <question_number>,
      "section": "<section_name_if_mentioned>",
      "text": "<full_question_text>",
      "options": ["option1", "option2", "option3", "option4"],
      "answer_type": "single|multi|true_false|short_answer|essay",
      "answer_hint": "<any_hints_or_answers_if_provided>",
      "confidence": <0.0_to_1.0>
    }
  ]
}

CRITICAL INSTRUCTIONS FOR ANSWER TYPES:

1. **single**: Use when question has 2+ distinct answer choices and ONE correct answer (A/B/C/D, etc.)
   - MUST extract ALL options into the "options" array
   - Include option labels (A), B), etc.) in the text
   - Example: ["A) 5", "B) 10", "C) 15", "D) 20"]

2. **multi**: Use when question has multiple correct answers (Select all that apply)
   - Same extraction rules as single

3. **true_false**: Use ONLY when question explicitly has True/False or Yes/No options
   - options: ["True", "False"] or ["Yes", "No"]

4. **short_answer**: Use when question expects a brief answer (number, word, short phrase)
   - Set options to null or empty array []

5. **essay**: Use when question expects a long written response
   - Set options to null or empty array []

EXTRACTION RULES:
- Extract questions EXACTLY as written, do not paraphrase
- For multiple choice: Look for answer choices labeled with letters (A, B, C, D), numbers (1, 2, 3, 4), or other markers
- Extract ALL options verbatim, including the label (e.g., "A) Option text")
- If options are on separate lines below the question, extract each one
- Set confidence to 0.9+ if question and options are crystal clear
- Set confidence <0.9 if options are ambiguous or hard to read
- If answer key is visible anywhere, include in answer_hint
- Do not generate or infer content that isn't in the PDF
- Return ONLY valid JSON, no markdown formatting or code blocks`
                },
                {
                  inline_data: {
                    mime_type: "application/pdf",
                    data: base64Pdf,
                  },
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: "return_questions",
                  description: "Return extracted questions from the exam PDF.",
                  parameters: {
                    type: "object",
                    properties: {
                      questions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            q_no: { type: "integer" },
                            section: { type: "string" },
                            text: { type: "string" },
                            options: {
                              type: "array",
                              items: { type: "string" }
                            },
                            answer_type: { type: "string", enum: ["multiple_choice", "true_false", "short_answer", "essay"] },
                            answer_hint: { type: "string" },
                            confidence: { type: "number" }
                          },
                          required: ["q_no", "text", "answer_type", "confidence"]
                        }
                      }
                    },
                    required: ["questions"]
                  }
                }
              ]
            }
          ],
          tool_config: { function_calling_config: { mode: "ANY" } },
          generationConfig: { temperature: 0.1 }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[parse-pdf] Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log(`[parse-pdf] Gemini response received`);

    // Prefer functionCall output if present
    let parsedData: any = null;
    try {
      const candidates = geminiData?.candidates || [];
      let fnArgs: any = null;
      for (const c of candidates) {
        const parts = c?.content?.parts || [];
        for (const p of parts) {
          if (p.functionCall && p.functionCall.name === 'return_questions') {
            fnArgs = p.functionCall.args;
            break;
          }
        }
        if (fnArgs) break;
      }

      if (fnArgs) {
        // args may already be an object; if it's a string, parse it
        parsedData = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs;
      } else {
        // Fallback to robust text parsing
        parsedData = await extractStructuredJson(geminiData);
      }

      if (!parsedData || typeof parsedData !== 'object') {
        throw new Error('Empty or invalid parsed JSON');
      }
    } catch (parseError) {
      console.error('[parse-pdf] JSON parse error:', parseError);
      const preview = (geminiData?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n') || '').substring(0, 600);
      console.error('[parse-pdf] Response preview:', preview);
      throw new Error(`Failed to parse Gemini response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    const questions = Array.isArray(parsedData.questions) ? parsedData.questions : [];
    console.log(`[parse-pdf] Extracted ${questions.length} questions`);

    // Count questions requiring review (confidence < 0.9)
    const questionsRequiringReview = questions.filter(
      (q: any) => q.confidence < 0.9
    ).length;

    // Insert parsed questions into database
    const questionsToInsert = questions.map((q: any) => ({
      section_id: sectionId,
      q_no: q.q_no,
      section_label: q.section || null,
      text: q.text,
      options: q.options || null,
      answer_type: q.answer_type,
      answer_hint: q.answer_hint || null,
      confidence: q.confidence,
      requires_review: q.confidence < 0.9,
    }));

    const { error: insertError } = await supabase
      .from("parsed_questions")
      .insert(questionsToInsert);

    if (insertError) {
      console.error("[parse-pdf] Insert error:", insertError);
      throw new Error(`Failed to save questions: ${insertError.message}`);
    }

    // Update section with parsing results
    await supabase
      .from("sections")
      .update({
        parsing_status: "completed",
        parsing_completed_at: new Date().toISOString(),
        total_questions: questions.length,
        questions_requiring_review: questionsRequiringReview,
      })
      .eq("id", sectionId);

    console.log(`[parse-pdf] Parsing completed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        totalQuestions: questions.length,
        questionsRequiringReview,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[parse-pdf] Error:", error);

    // Update section status to failed if we have sectionId
    if (sectionId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("sections")
          .update({ parsing_status: "failed" })
          .eq("id", sectionId);
      } catch (updateError) {
        console.error("[parse-pdf] Failed to update error status:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
