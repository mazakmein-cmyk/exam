import { LogIn, LogOut, Menu, User, ChevronRight, Sparkles } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import MockSetuLogo from "@/components/MockSetuLogo";
import ProfileDialog from "@/components/ProfileDialog";

interface NavbarProps {
  navButtonLabel?: string;
  navButtonLink?: string;
}


const Navbar = ({ navButtonLabel = "Exam Library", navButtonLink = "/marketplace" }: NavbarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => { subscription.unsubscribe(); window.removeEventListener("scroll", handleScroll); };
  }, []);

  const isHome = location.pathname === "/";

  return (
    <>
      <ProfileDialog isOpen={showProfile} onOpenChange={setShowProfile} />
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled || !isHome
            ? "bg-white/80 dark:bg-[#080B14]/80 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.06] shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto max-w-6xl px-5">
          <div className="flex h-[60px] items-center justify-between">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-2.5 group" aria-label="MockSetu Home">
              <div className="w-8 h-8 flex items-center justify-center">
                <MockSetuLogo />
              </div>
              <span
                className={`text-[17px] font-bold tracking-[-0.02em] transition-colors ${
                  isHome && !scrolled ? "text-white" : "text-foreground"
                }`}
              >
                Mock<span className="text-gradient">Setu</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              <Link to={navButtonLink}>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isHome && !scrolled
                      ? "text-white/70 hover:text-white hover:bg-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {navButtonLabel}
                </button>
              </Link>

              {session ? (
                <>
                  <button
                    onClick={() => setShowProfile(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isHome && !scrolled
                        ? "text-white/70 hover:text-white hover:bg-white/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </button>
                  <button
                    onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isHome && !scrolled
                        ? "text-white/70 hover:text-white hover:bg-white/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to={location.pathname === "/marketplace" ? "/student-auth?from=marketplace" : "/student-auth"}
                >
                  <button className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold bg-[#6C3EF4] text-white hover:bg-[#5B2FE3] shadow-md shadow-[#6C3EF4]/25 hover:shadow-lg hover:shadow-[#6C3EF4]/30 hover:-translate-y-[1px] transition-all duration-200 btn-primary-glow ml-2">
                    <LogIn className="h-3.5 w-3.5" />
                    Login Free
                  </button>
                </Link>
              )}
            </div>

            {/* Mobile hamburger */}
            <div className="md:hidden">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <button
                    className={`p-2 rounded-lg ${
                      isHome && !scrolled ? "text-white hover:bg-white/10" : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] border-border/60">
                  <SheetHeader className="text-left mb-6">
                    <SheetTitle className="flex items-center gap-2.5">
                      <MockSetuLogo />
                      <span className="font-bold text-[17px] tracking-tight">Mock<span className="text-gradient">Setu</span></span>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-1">
                    <Link to={navButtonLink} onClick={() => setIsOpen(false)}>
                      <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-secondary transition-colors text-sm font-medium">
                        {navButtonLabel} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>

                    {session ? (
                      <>
                        <button
                          onClick={() => { setShowProfile(true); setIsOpen(false); }}
                          className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-secondary transition-colors text-sm font-medium w-full"
                        >
                          <span className="flex items-center gap-2"><User className="h-4 w-4" /> Profile</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={async () => { await supabase.auth.signOut(); navigate("/"); setIsOpen(false); }}
                          className="flex items-center gap-2 px-3 py-3 rounded-xl hover:bg-red-50 text-red-500 transition-colors text-sm font-medium w-full"
                        >
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </>
                    ) : (
                      <Link
                        to={location.pathname === "/marketplace" ? "/student-auth?from=marketplace" : "/student-auth"}
                        onClick={() => setIsOpen(false)}
                      >
                        <div className="mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#6C3EF4] text-white text-sm font-semibold shadow-lg shadow-[#6C3EF4]/25">
                          <LogIn className="h-4 w-4" /> Login Free
                        </div>
                      </Link>
                    )}

                    <div className="mt-4 pt-4 border-t border-border/60">
                      <Link to="/auth" onClick={() => setIsOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5" /> Creator Login
                        </div>
                      </Link>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>
      {/* Spacer for fixed nav */}
      {(!isHome) && <div className="h-[60px]" />}
    </>
  );
};

export default Navbar;
