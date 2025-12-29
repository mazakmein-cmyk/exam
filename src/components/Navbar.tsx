import { Button } from "@/components/ui/button";
import { FileText, LogIn, LogOut, Menu } from "lucide-react";
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

interface NavbarProps {
  navButtonLabel?: string;
  navButtonLink?: string;
}

const Navbar = ({ navButtonLabel = "Marketplace", navButtonLink = "/marketplace" }: NavbarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
    setIsOpen(false);
  };

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to={navButtonLink} onClick={() => mobile && setIsOpen(false)}>
        <Button variant={mobile ? "ghost" : "ghost"} className={mobile ? "w-full justify-start" : ""}>
          {navButtonLabel}
        </Button>
      </Link>
      {session ? (
        <Button
          variant={mobile ? "ghost" : "outline"}
          size={mobile ? "default" : "sm"}
          onClick={handleLogout}
          className={mobile ? "w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" : ""}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      ) : (
        <Link
          to={location.pathname === "/marketplace" ? "/student-auth?from=marketplace" : "/student-auth"}
          onClick={() => mobile && setIsOpen(false)}
        >
          <Button
            variant={mobile ? "ghost" : "outline"}
            size={mobile ? "default" : "sm"}
            className={mobile ? "w-full justify-start" : ""}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign In
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">ExamSim</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <NavItems />
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[250px] sm:w-[300px]">
                <SheetHeader className="text-left mb-6">
                  <SheetTitle className="flex items-center space-x-2">
                    <FileText className="h-6 w-6 text-primary" />
                    <span>ExamSim</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col space-y-4">
                  <NavItems mobile />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
