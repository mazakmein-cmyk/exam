-- ============================================================
-- LIVE EXAM: STRICT MULTI-SELECT GRADING
-- grade_live_answer treated every array correct_answer as "any of these":
-- for a 2-of-4 question (correct ["0","2"]) a student who submitted the
-- scalar 0 matched via `p_correct @> p_selected` and scored CORRECT. A
-- partial answer must be wrong.
-- The lenient scalar-vs-array path is kept for the legitimate case of a
-- single answer stored as a 1-element array — existing single-select data
-- depends on it.
-- Forward migration only: same signature, so the submit_live_response call
-- site in 20260729020000_live_exam_security.sql keeps working unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION public.grade_live_answer(p_correct JSONB, p_selected JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sel_text TEXT;
  v_correct_set TEXT[];
  v_selected_set TEXT[];
BEGIN
  IF p_correct IS NULL OR p_selected IS NULL
     OR jsonb_typeof(p_correct) = 'null' OR jsonb_typeof(p_selected) = 'null' THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_correct) = 'array' THEN
    IF jsonb_typeof(p_selected) = 'array' THEN
      -- multi-select: set equality
      IF p_correct <@ p_selected AND p_selected <@ p_correct THEN
        RETURN true;
      END IF;
      -- Same test on text-normalized sets, so ["0","2"] also matches [0,2]
      -- (imports store option indices as strings, clients may send numbers).
      SELECT array_agg(DISTINCT e ORDER BY e) INTO v_correct_set
      FROM jsonb_array_elements_text(p_correct) AS e;
      SELECT array_agg(DISTINCT e ORDER BY e) INTO v_selected_set
      FROM jsonb_array_elements_text(p_selected) AS e;
      RETURN v_correct_set IS NOT NULL AND v_selected_set IS NOT NULL
             AND v_correct_set = v_selected_set;
    END IF;

    -- Scalar submitted against a multi-answer set: a partial answer is wrong.
    IF jsonb_array_length(p_correct) <> 1 THEN
      RETURN false;
    END IF;

    -- Single answer stored as a 1-element array (unchanged lenient match).
    v_sel_text := trim(both '"' from p_selected::text);
    RETURN p_correct @> p_selected
        OR p_correct @> to_jsonb(v_sel_text);
  END IF;

  -- Scalar correct answer submitted as an array: only a 1-element match counts.
  IF jsonb_typeof(p_selected) = 'array' THEN
    RETURN jsonb_array_length(p_selected) = 1
       AND (p_selected ->> 0) = trim(both '"' from p_correct::text);
  END IF;

  RETURN trim(both '"' from p_correct::text) = trim(both '"' from p_selected::text);
END;
$$;
