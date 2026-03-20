import React from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import certshackLogo from '@/assets/certshack_logo.png'
import type { PassedExam } from '../gamification/types'

export interface CertOptions {
  includeExams: boolean
  selectedExamCodes: string[] | null // null = all
  includeLabs: boolean
  includeProviderGrouping: boolean
}

interface CertificatePreviewProps {
  displayName: string
  certId: string
  token: string
  issuedAt: string
  options: CertOptions
  data: { passedExams: Record<string, PassedExam>; labsCompleted: number }
  examTitles?: Record<string, string>
}

const CertificatePreview = React.forwardRef<HTMLDivElement, CertificatePreviewProps>(
  ({ displayName, certId, token, issuedAt, options, data, examTitles = {} }, ref) => {
    const verifyUrl = `https://certshack.com/verify/${token}`

    // Group exams by provider if requested
    const examEntries = Object.values(data.passedExams)
    const filteredExams = options.selectedExamCodes
      ? examEntries.filter((e) => options.selectedExamCodes!.includes(e.examCode))
      : examEntries

    const grouped: Record<string, typeof filteredExams> = {}
    if (options.includeProviderGrouping) {
      for (const exam of filteredExams) {
        const provider = exam.provider || 'Other'
        ;(grouped[provider] ??= []).push(exam)
      }
    } else {
      grouped[''] = filteredExams
    }

    const issuedDate = new Date(issuedAt)
    const issuedFormatted = issuedDate.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    })

    return (
      <div
        ref={ref}
        style={{
          width: 1123,
          height: 794,
          fontFamily: 'Arial, Helvetica, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Watermark pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0.03,
            fontSize: 24,
            fontWeight: 'bold',
            color: '#F97316',
            lineHeight: '48px',
            letterSpacing: 8,
            transform: 'rotate(-30deg)',
            transformOrigin: 'center center',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
            padding: '0 0 400px 0',
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ marginLeft: i % 2 === 0 ? 0 : 80 }}>
              {'certshack   '.repeat(12)}
            </div>
          ))}
        </div>

        {/* Orange header */}
        <div
          style={{
            height: 60,
            backgroundColor: '#F97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 40px',
            position: 'relative',
            zIndex: 1,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={certshackLogo}
              alt="CertShack"
              style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, backgroundColor: '#FFFFFF', padding: 2 }}
            />
            <div style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', letterSpacing: 1 }}>
              certshack
            </div>
          </div>
          {/* Dot grid accent */}
          <div style={{ display: 'flex', gap: 6, opacity: 0.5 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 60px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 'bold',
              letterSpacing: 4,
              color: '#6B7280',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Certificate of Achievement
          </div>

          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
            This certifies that
          </div>

          <div
            style={{
              fontSize: 40,
              fontWeight: 'bold',
              color: '#1F2937',
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            {displayName}
          </div>

          <div
            style={{
              width: 280,
              height: 3,
              backgroundColor: '#F97316',
              borderRadius: 2,
              marginBottom: 20,
            }}
          />

          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
            has demonstrated expertise by completing:
          </div>

          {/* Exam list */}
          {options.includeExams && filteredExams.length > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              {Object.entries(grouped).map(([provider, exams]) => (
                <div
                  key={provider}
                  style={{
                    fontSize: 16,
                    color: '#1F2937',
                    marginBottom: 6,
                    lineHeight: '24px',
                  }}
                >
                  {provider && (
                    <span style={{ fontWeight: 'bold' }}>{provider}: </span>
                  )}
                  {exams.map((e, i) => (
                    <div key={e.examCode} style={{ marginBottom: i < exams.length - 1 ? 2 : 0 }}>
                      {examTitles[e.examCode]
                        ? `${examTitles[e.examCode]} (${e.examCode})`
                        : e.examCode}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Labs count */}
          {options.includeLabs && data.labsCompleted > 0 && (
            <div style={{ fontSize: 16, color: '#1F2937', marginBottom: 8 }}>
              {data.labsCompleted} Skill Lab{data.labsCompleted !== 1 ? 's' : ''} Completed
            </div>
          )}

          {/* Trust note */}
          <div
            style={{
              fontSize: 10,
              color: '#9CA3AF',
              marginTop: 12,
              textAlign: 'center',
              maxWidth: 600,
            }}
          >
            This certificate confirms an authenticated, paying user requested these claims.
            Verify authenticity by scanning the QR code.
          </div>
        </div>

        {/* Grey footer */}
        <div
          style={{
            height: 56,
            backgroundColor: '#F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 40px',
            position: 'relative',
            zIndex: 1,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#6B7280' }}>
            <span>Issued: {issuedFormatted}</span>
            <span>ID: {certId}</span>
          </div>
          <QRCodeCanvas value={verifyUrl} size={40} />
        </div>
      </div>
    )
  }
)

CertificatePreview.displayName = 'CertificatePreview'

export default CertificatePreview
