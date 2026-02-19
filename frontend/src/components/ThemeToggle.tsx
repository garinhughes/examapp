import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sun, Moon, EyeOff } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2 p-2 rounded-lg border bg-background/50 backdrop-blur-sm self-start">
      <Button
        variant={theme === "light" ? "default" : "ghost"}
        size="icon"
        onClick={() => setTheme("light")}
        title="Light Mode"
      >
        <Sun className="h-5 w-5" />
      </Button>
      <Button
        variant={theme === "dark" ? "default" : "ghost"}
        size="icon"
        onClick={() => setTheme("dark")}
        title="Dark Mode"
      >
        <Moon className="h-5 w-5" />
      </Button>
      {/* <Button
        variant={theme === "colorblind" ? "default" : "ghost"}
        size="icon"
        onClick={() => setTheme("colorblind")}
        title="Colorblind Mode (High Contrast)"
      >
        <EyeOff className="h-5 w-5" />
      </Button> */}
    </div>
  );
}
