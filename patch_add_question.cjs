const fs = require('fs');

function patchAddQuestion() {
  let content = fs.readFileSync('src/pages/LiveExamDetail.tsx', 'utf8');

  // Replace the Add Question section
  const searchString = `{/* Add new question form */}
                  <div ref={questionFormRef} className="border-t border-border/40 pt-6">
                    <h4 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <Plus className="h-5 w-5 text-blue-500" />
                      Add New Question
                    </h4>

                    <div className="space-y-4">
                      {/* Time per question */}`;

  const newString = `{/* Add new question form */}
                  <div ref={questionFormRef} className="border-t border-border/40 pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                      <h4 className="text-base font-semibold flex items-center gap-2">
                        <Plus className="h-5 w-5 text-blue-500" />
                        Add New Question
                      </h4>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:inline-block">Format</span>
                        <Select value={questionFormat} onValueChange={setQuestionFormat}>
                          <SelectTrigger className="w-full sm:w-[280px] h-auto py-2 rounded-lg bg-card">
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard" className="py-2 group">
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-foreground group-focus:text-white">Standard Question</span>
                                <span className="text-xs font-medium text-muted-foreground group-focus:text-white/80">Single question with options</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="passage" className="py-2 group">
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-foreground group-focus:text-white">Passage-based Question</span>
                                <span className="text-xs font-medium text-muted-foreground group-focus:text-white/80">Question linked to a shared passage</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Tabs defaultValue="pdf" className="w-full mb-6">
                      <TabsList className="grid w-full grid-cols-2 mb-6 h-11 rounded-xl p-1">
                        <TabsTrigger value="pdf" className="rounded-lg text-xs sm:text-sm font-semibold">PDF Snipping/Direct Upload</TabsTrigger>
                        <TabsTrigger value="ai" className="gap-2 rounded-lg text-xs sm:text-sm font-semibold">
                          AI Parse
                          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20">
                            Coming Soon
                          </Badge>
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="pdf" className="space-y-6">
                        {/* Dummy layout for PDF area to show user intent - full implementation in LiveExamDetail would follow ExamDetail */}
                        <div className="p-4 bg-muted/30 rounded-xl border border-dashed text-center text-muted-foreground text-sm">
                          <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          PDF Snipping Tool Enabled (Requires LiveSection pdf_url backend support)
                        </div>
                      </TabsContent>
                      <TabsContent value="ai">
                         <div className="p-4 bg-muted/30 rounded-xl border border-dashed text-center text-muted-foreground text-sm">
                          <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          AI Parser Coming Soon
                        </div>
                      </TabsContent>
                    </Tabs>

                    <div className="space-y-4">
                      {/* Time per question */}`;

  if (content.includes(searchString)) {
    content = content.replace(searchString, newString);
    fs.writeFileSync('src/pages/LiveExamDetail.tsx', content);
    console.log('LiveExamDetail.tsx Add Question patched successfully');
  } else {
    console.log('Could not find Add Question section to patch');
  }
}

patchAddQuestion();
