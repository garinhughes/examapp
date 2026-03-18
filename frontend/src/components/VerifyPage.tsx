import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

interface CertificatePayload {
  displayName: string
  issuedAt: string
  includeExams: boolean
  includeLabs: boolean
  includeProviderGrouping: boolean
  passedExams: Record<string, { examCode: string; provider: string; bestScore: number }>
  labsCompleted: number
}

export default function VerifyPage() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading')
  const [certificate, setCertificate] = useState<CertificatePayload | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      setErrorMessage('No certificate token provided.')
      return
    }

    fetch(`${import.meta.env.VITE_API_URL}/certificates/verify/${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok && data.valid) {
          setCertificate(data.certificate as CertificatePayload)
          setStatus('valid')
        } else {
          setErrorMessage(data.message || 'Invalid certificate.')
          setStatus('invalid')
        }
      })
      .catch(() => {
        setErrorMessage('Failed to verify certificate. Please try again.')
        setStatus('invalid')
      })
  }, [token])

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F9FAFB',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            backgroundColor: '#F97316',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
          }}
        >
          <span style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' }}>
            certshack
          </span>
        </div>

        <div style={{ padding: 32 }}>
          {status === 'loading' && (
            <div style={{ textAlign: 'center', color: '#6B7280' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p>Verifying certificate…</p>
            </div>
          )}

          {status === 'invalid' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#DC2626',
                  marginBottom: 8,
                }}
              >
                Invalid Certificate
              </h2>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                {errorMessage}
              </p>
            </div>
          )}

          {status === 'valid' && certificate && (
            <div>
              {/* Verified badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 20,
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 24,
                }}
              >
                ✓ Verified by certshack
              </div>

              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 'bold',
                  color: '#1F2937',
                  marginBottom: 4,
                }}
              >
                {certificate.displayName}
              </h2>

              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
                Issued:{' '}
                {new Date(certificate.issuedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>

              {/* Exams */}
              {certificate.includeExams &&
                Object.keys(certificate.passedExams).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      Passed Exams
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.values(certificate.passedExams).map((exam) => (
                        <div
                          key={exam.examCode}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: 8,
                            backgroundColor: '#F9FAFB',
                            fontSize: 14,
                          }}
                        >
                          <span style={{ fontWeight: 500, color: '#1F2937' }}>
                            {exam.examCode}
                          </span>
                          <span style={{ color: '#6B7280', fontSize: 13 }}>
                            {exam.provider}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Labs */}
              {certificate.includeLabs && certificate.labsCompleted > 0 && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    backgroundColor: '#F9FAFB',
                    fontSize: 14,
                    color: '#1F2937',
                  }}
                >
                  🧪 {certificate.labsCompleted} Skill Lab
                  {certificate.labsCompleted !== 1 ? 's' : ''} Completed
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
