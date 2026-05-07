import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <>
      <Helmet>
        <title>Page Not Found | certshack</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <p className="text-8xl font-bold text-muted-foreground/30">404</p>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground">This page doesn't exist or may have moved.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/exams')}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Browse exams
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            Go home
          </button>
        </div>
      </div>
    </>
  )
}
