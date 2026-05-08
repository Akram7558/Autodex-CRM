'use client'

import { DistributionManager } from '@/components/saas/DistributionManager'
import { PlansManager } from '@/components/saas/PlansManager'

export default function SuperAdminSettingsPage() {
  return (
    <div className="p-10 pt-2 max-w-7xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Paramètres
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
          Configuration globale de la plateforme AutoDex.
        </p>
      </div>

      <PlansManager />

      <DistributionManager
        title="Distribution des RDV SaaS"
        description="Configurez la répartition automatique des nouveaux RDV SaaS entre les commerciaux. La somme des pourcentages actifs doit être égale à 100%."
        apiBase="/api/saas-distribution"
        countLabel="RDV reçus"
        lastLabel="Dernier RDV"
        roleNoun="commercial"
        roleAdd="commercial"
        countTotalKey="rdv_count_total"
        count30dKey="rdv_count_30days"
      />

      <DistributionManager
        title="Distribution des Prospects SaaS"
        description="Configurez la répartition automatique des nouveaux prospects entre les prospecteurs. La somme des pourcentages actifs doit être égale à 100%."
        apiBase="/api/saas-prospect-distribution"
        countLabel="Prospects reçus"
        lastLabel="Dernier prospect"
        roleNoun="prospecteur"
        roleAdd="prospecteur"
        countTotalKey="prospect_count_total"
        count30dKey="prospect_count_30days"
      />
    </div>
  )
}
