export default function Footer() {
  return (
    <footer className="mt-12 border-t border-border py-6 px-4 text-center text-xs text-muted-foreground">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} certshack.com</span>
        <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
          <a href="/refund" className="hover:text-foreground transition-colors">Refund Policy</a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://www.linkedin.com/company/certshack"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="CertShack on LinkedIn"
          >
            <img src="/logos/linkedin.svg" alt="LinkedIn" width="18" height="18" />
          </a>
          <a
            href="https://x.com/certshack"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="CertShack on X"
          >
            <img src="/logos/x.svg" alt="X" width="18" height="18" className="brightness-0 dark:invert" />
          </a>
          <a
            href="https://www.youtube.com/@certshack"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="CertShack on YouTube"
          >
            <img src="/logos/youtube.svg" alt="YouTube" width="18" height="18" />
          </a>
        </div>
      </div>
    </footer>
  )
}
