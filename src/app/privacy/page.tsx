import Link from 'next/link'

export const metadata = {
  title: 'Politique de confidentialité · AutoDex CRM',
  description:
    "Politique de confidentialité d'AutoDex CRM — collecte de données, intégration WhatsApp, et engagement de non-revente.",
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tight">
          Politique de confidentialité
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Dernière mise à jour : 26 avril 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              1. Présentation
            </h2>
            <p>
              AutoDex CRM (« AutoDex », « nous ») est une plateforme de
              gestion de la relation client conçue pour les concessionnaires
              automobiles en Algérie. La présente politique explique quelles
              données nous collectons, pourquoi, et comment elles sont
              protégées.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              2. Données collectées
            </h2>
            <p>
              Dans le cadre de l&apos;utilisation du CRM, nous collectons et
              traitons les informations suivantes :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Informations sur les prospects et clients : nom, téléphone,
                e-mail, wilaya, source du contact, notes.
              </li>
              <li>
                Informations sur les véhicules : marque, modèle, année,
                référence, prix, statut (disponible, réservé, vendu).
              </li>
              <li>
                Données de suivi commercial : rendez-vous, statuts, dépôts
                reçus, ventes conclues, activités enregistrées.
              </li>
              <li>
                Données de compte utilisateur : adresse e-mail et identifiants
                d&apos;authentification du personnel du showroom.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              3. Finalités du traitement
            </h2>
            <p>Ces données sont traitées exclusivement pour :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Gérer la relation commerciale avec vos prospects et clients.</li>
              <li>Suivre l&apos;état du stock et des ventes du showroom.</li>
              <li>
                Permettre la prise de rendez-vous, le suivi de réservations et
                la conclusion de ventes.
              </li>
              <li>Améliorer la qualité du service et la performance commerciale.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              4. Intégration WhatsApp
            </h2>
            <p>
              AutoDex propose une intégration avec WhatsApp Business afin de
              faciliter la communication entre les vendeurs et les prospects.
              Lorsque vous activez cette intégration :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Les numéros de téléphone des prospects sont utilisés pour
                ouvrir une conversation WhatsApp depuis l&apos;application.
              </li>
              <li>
                Les jetons d&apos;accès Meta sont stockés de manière sécurisée et
                ne sont jamais partagés avec des tiers.
              </li>
              <li>
                Les messages échangés via WhatsApp restent soumis à la
                politique de confidentialité de Meta. AutoDex ne conserve pas
                les contenus des messages au-delà de ce qui est nécessaire au
                fonctionnement du service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              5. Aucune revente à des tiers
            </h2>
            <p>
              <strong>
                Nous ne vendons, ne louons et ne cédons aucune donnée à des
                tiers.
              </strong>{' '}
              Vos données restent la propriété de votre showroom et ne sont
              utilisées que pour les finalités décrites ci-dessus. Les seuls
              prestataires techniques ayant accès à l&apos;infrastructure
              (hébergement, base de données) sont liés par des engagements
              stricts de confidentialité.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              6. Sécurité
            </h2>
            <p>
              Les données sont stockées sur une infrastructure sécurisée
              (Supabase) avec chiffrement en transit (TLS) et au repos.
              L&apos;accès au CRM est protégé par authentification et limité
              aux utilisateurs autorisés du showroom.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              7. Vos droits
            </h2>
            <p>
              Conformément à la loi algérienne n° 18-07 relative à la
              protection des personnes physiques dans le traitement des
              données à caractère personnel, vous disposez d&apos;un droit
              d&apos;accès, de rectification, d&apos;opposition et de
              suppression de vos données. Pour exercer ces droits, contactez
              le showroom concerné ou écrivez-nous.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              8. Conservation
            </h2>
            <p>
              Les données des prospects et clients sont conservées pendant la
              durée nécessaire à la relation commerciale, puis archivées ou
              supprimées sur demande de l&apos;utilisateur ou du showroom.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              9. Contact
            </h2>
            <p>
              Pour toute question concernant cette politique ou le traitement
              de vos données, vous pouvez nous écrire à{' '}
              <a
                href="mailto:shytfcom@autodex.store"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                shytfcom@autodex.store
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          &copy; 2026 AutoDex CRM
        </footer>
      </div>
    </main>
  )
}
