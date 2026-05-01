'use client'

import { Users } from 'lucide-react'

export default function SuperAdminProspectsPage() {
  return (
    <div className="p-10 pt-2 max-w-7xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Prospects SaaS
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
          Showrooms potentiels suivis par l&apos;équipe AutoDex.
        </p>
      </div>

      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-12 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center">
          <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-white">
          Bientôt disponible
        </h2>
        <p className="text-sm text-zinc-500 max-w-md">
          Cette page permettra de gérer les showrooms prospects (leads SaaS),
          d&apos;assigner des prospecteurs et de suivre leur conversion en
          comptes payants.
        </p>
      </div>
    </div>
  )
}
