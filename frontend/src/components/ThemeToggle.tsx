import { useExam } from "@/exam/ExamContext";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { dark, setDark } = useExam();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setDark(!dark)}
      title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
