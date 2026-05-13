'use client'

import { Suspense } from 'react'
import { ProspectsView } from '@/components/ProspectsView'

export default function ProspectsPage() {
    return (
          <Suspense fallback={null}>
                  <ProspectsView />
          </Suspense>
        )
}
