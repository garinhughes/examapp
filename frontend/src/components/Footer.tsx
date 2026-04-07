export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border py-6 px-0 text-center text-xs text-muted-foreground">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© {new Date().getFullYear()} certshack.com</span>
        <nav className="flex items-center gap-4">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
          <a href="/refund" className="hover:text-foreground transition-colors">Refund Policy</a>
        </nav>
      </div>
    </footer>
  )
}
