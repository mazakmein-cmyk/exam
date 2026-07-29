import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Radio } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMock: () => void;
  onSelectLive: () => void;
};

const ExamTypeDialog = ({ open, onOpenChange, onSelectMock, onSelectLive }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 bg-background overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-xl font-bold">Choose Exam Type</DialogTitle>
          <DialogDescription className="text-sm">
            Select the type of exam you want to create.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 grid gap-3">
          {/* Mock Exam Option */}
          <button
            onClick={() => {
              onOpenChange(false);
              onSelectMock();
            }}
            className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-border bg-card text-left transition-all duration-200 hover:border-[#6C3EF4] hover:bg-[#6C3EF4]/[0.03] hover:shadow-lg hover:shadow-[#6C3EF4]/10 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3EF4] focus-visible:ring-offset-2"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6C3EF4]/15 to-[#A855F7]/10 border border-[#6C3EF4]/20 transition-colors duration-200 group-hover:from-[#6C3EF4]/25 group-hover:to-[#A855F7]/15">
              <FileText className="h-5 w-5 text-[#6C3EF4]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold text-foreground mb-0.5">Create Mock Exam</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Create a practice exam with sections, questions, and timed simulations for students.
              </p>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#6C3EF4]">
                <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>

          {/* Live Exam Option */}
          <button
            onClick={() => {
              onOpenChange(false);
              onSelectLive();
            }}
            className="group relative flex items-start gap-4 p-5 rounded-xl border-2 border-border bg-card text-left transition-all duration-200 hover:border-emerald-500 hover:bg-emerald-500/[0.03] hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-500/20 transition-colors duration-200 group-hover:from-emerald-500/25 group-hover:to-teal-500/15">
              <Radio className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold text-foreground mb-0.5">Create Live Exam</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Host a live quiz where you unlock questions one at a time and students compete on a real-time leaderboard.
              </p>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-emerald-500">
                <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExamTypeDialog;
