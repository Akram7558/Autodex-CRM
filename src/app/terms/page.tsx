import Link from 'next/link'

export const metadata = {
  title: "Conditions d'utilisation · AutoDex CRM",
  description:
    "Conditions générales d'utilisation d'AutoDex CRM — plateforme de gestion commerciale pour concessionnaires automobiles.",
}

export default function TermsPage() {
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
          Conditions d&apos;utilisation
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Dernière mise à jour : 26 avril 2026
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              1. Objet
            </h2>
            <p>
              Les présentes conditions générales d&apos;utilisation (« CGU »)
              régissent l&apos;accès et l&apos;utilisation d&apos;AutoDex CRM
              (« AutoDex », « la plateforme »), un service en ligne de
              gestion de la relation client destiné aux concessionnaires
              automobiles en Algérie. En utilisant la plateforme, vous
              acceptez les présentes conditions.
            </p>
            <p className="mt-2">
              La plateforme est éditée et exploitée par SHYFTCOM LLC
              (AutoDex), Limited Liability Company du Nouveau-Mexique
              (États-Unis), dont le siège est situé 102 Gold Ave SW,
              Albuquerque, NM 87102, United States. Contact :
              contact@autodex.store.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              2. Description du service
            </h2>
            <p>
              AutoDex est un outil destiné aux showrooms et concessionnaires
              automobiles pour gérer :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Les prospects et leur suivi commercial.</li>
              <li>Le stock de véhicules (marque, modèle, prix, statut).</li>
              <li>Les rendez-vous, réservations et ventes conclues.</li>
              <li>Les activités et alertes commerciales.</li>
            </ul>
            <p className="mt-2">
              La plateforme est réservée à un usage professionnel par les
              équipes commerciales d&apos;un showroom automobile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              3. Intégrations tierces — WhatsApp, Instagram, Facebook
            </h2>
            <p>
              AutoDex propose des intégrations avec des services tiers afin de
              faciliter la communication avec vos prospects :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>WhatsApp Business</strong> : envoi de messages
                directs et appels via l&apos;API officielle de Meta.
              </li>
              <li>
                <strong>Facebook Messenger</strong> : réception et gestion
                des leads issus de Facebook.
              </li>
              <li>
                <strong>Instagram Business</strong> : réception et gestion
                des leads issus d&apos;Instagram.
              </li>
            </ul>
            <p className="mt-2">
              L&apos;utilisation de ces intégrations est soumise aux
              conditions des plateformes concernées (Meta Platforms, Inc.).
              AutoDex ne peut être tenu responsable des changements,
              limitations ou interruptions imposés par ces tiers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              4. Responsabilités de l&apos;utilisateur
            </h2>
            <p>En utilisant AutoDex, vous vous engagez à :</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                Fournir des informations exactes lors de la création de
                comptes utilisateurs et de l&apos;enregistrement des
                prospects.
              </li>
              <li>
                Préserver la confidentialité de vos identifiants et signaler
                immédiatement toute utilisation non autorisée.
              </li>
              <li>
                Respecter la réglementation en vigueur, notamment la loi
                algérienne n° 18-07 sur la protection des données
                personnelles, lors de la collecte et du traitement des
                données de prospects.
              </li>
              <li>
                Obtenir le consentement nécessaire des prospects avant de
                les contacter par WhatsApp, SMS, e-mail ou tout autre canal.
              </li>
              <li>
                Ne pas utiliser la plateforme pour envoyer du spam, des
                contenus illicites, frauduleux ou portant atteinte à des
                tiers.
              </li>
              <li>
                Ne pas tenter d&apos;accéder à des données ne relevant pas de
                votre showroom, ni de contourner les mécanismes de sécurité.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              5. Utilisation des données
            </h2>
            <p>
              Les données enregistrées dans AutoDex (prospects, véhicules,
              ventes) sont utilisées{' '}
              <strong>
                exclusivement pour la gestion commerciale de votre showroom
              </strong>{' '}
              :
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Suivi des prospects et conversion en clients.</li>
              <li>Gestion des rendez-vous et des réservations.</li>
              <li>Suivi du stock et des ventes.</li>
              <li>Production de tableaux de bord internes.</li>
            </ul>
            <p className="mt-2">
              Ces données ne sont jamais utilisées à des fins publicitaires,
              ni revendues à des tiers. Pour plus de détails, consultez notre{' '}
              <Link
                href="/privacy"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              6. Disponibilité du service
            </h2>
            <p>
              AutoDex met tout en œuvre pour assurer une disponibilité
              continue de la plateforme. Toutefois, des interruptions peuvent
              survenir pour des raisons de maintenance, de mise à jour ou en
              cas de force majeure. AutoDex ne peut être tenu responsable des
              dommages résultant d&apos;une indisponibilité temporaire.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              7. Propriété intellectuelle
            </h2>
            <p>
              L&apos;interface, le code, les marques et le design d&apos;AutoDex
              sont la propriété exclusive de leurs auteurs. Les données saisies
              par l&apos;utilisateur restent la propriété du showroom
              concerné.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              8. Suspension et résiliation
            </h2>
            <p>
              AutoDex se réserve le droit de suspendre ou résilier l&apos;accès
              d&apos;un utilisateur en cas de manquement aux présentes CGU,
              d&apos;usage abusif de la plateforme ou de non-paiement de
              l&apos;abonnement, le cas échéant.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              9. Modification des CGU
            </h2>
            <p>
              AutoDex peut modifier les présentes CGU à tout moment. La date
              de dernière mise à jour est indiquée en haut de cette page. La
              poursuite de l&apos;utilisation du service après modification
              vaut acceptation des nouvelles conditions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              10. Contact
            </h2>
            <p>
              Pour toute question relative aux présentes conditions, vous
              pouvez nous écrire à{' '}
              <a
                href="mailto:contact@autodex.store"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                contact@autodex.store
              </a>
              .
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            &copy; 2026 AutoDex CRM
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            AutoDex est un produit de SHYFTCOM LLC — 102 Gold Ave SW,
            Albuquerque, NM 87102, USA — contact@autodex.store ·{' '}
            <Link href="/mentions-legales" className="underline underline-offset-2">
              Mentions légales
            </Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
