'use client'
// ─────────────────────────────────────────────────────────────────────
// LoginCard — premium glass login (matches the landing redesign).
// ─────────────────────────────────────────────────────────────────────
// Preserves the existing auth surface 1:1:
//   • supabase.auth.signInWithPassword({ email, password })
//   • role-based hard-nav redirect after success (so the SSR cookie
//     is visible to the middleware on the next request)
//   • ?reset=success banner on URL load with URL cleanup
// Demo button now FILLS the form instead of auto-signing in, so users
// see the credentials before submitting (per redesign brief).
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTranslations } from '@/hooks/useTranslations'
import ThemeToggle from '@/components/landing/ThemeToggle'
import LocaleToggle from '@/components/landing/LocaleToggle'

export default function LoginCard() {
  const { t } = useTranslations()

  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  // Surface the reset-password success banner once, then strip the
  // query param so a refresh doesn't keep it forever.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === 'success') {
      setResetSuccess(true)
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr || !data?.user) {
      setError(authErr?.message ?? t('login.error_generic'))
      setLoading(false)
      return
    }
    await routeAfterLogin(data.user.id)
  }

  // Role-based redirect with a hard navigation so middleware sees the
  // session cookie just set by signInWithPassword.
  async function routeAfterLogin(userId: string) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    let target = '/dashboard'
    switch (roleRow?.role) {
      case 'super_admin':      target = '/dashboard/super-admin';           break
      case 'commercial':       target = '/dashboard/super-admin';           break
      case 'prospecteur_saas': target = '/dashboard/super-admin/prospects'; break
      case 'closer':           target = '/dashboard/rendez-vous';           break
      case 'prospecteur':      target = '/dashboard/leads';                 break
    }
    window.location.href = target
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-6 py-12"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Ambient emerald glow */}
      <div
        aria-hidden="true"
        className="absolute top-1/3 start-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'var(--accent-glow)', opacity: 0.18 }}
      />

      {/* Floating toggles */}
      <div className="absolute top-6 end-6 flex items-center gap-2 z-10">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-3xl backdrop-blur-xl p-8 md:p-10 shadow-2xl"
          style={{
            background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-glass)',
          }}
        >
          {/* Brand */}
          <Link href="/" className="flex items-center justify-center gap-2 group">
            <span
              className="font-bold text-xl tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              AutoDex
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full transition-transform group-hover:scale-150"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent-glow)',
              }}
              aria-hidden="true"
            />
          </Link>
          <p
            className="mt-2 text-sm text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('login.tagline')}
          </p>

          {/* Heading */}
          <div className="mt-8 text-center">
            <h1
              className="text-2xl md:text-3xl font-semibold tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('login.title')}
            </h1>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('login.subtitle')}
            </p>
          </div>

          {/* Reset-success banner */}
          {resetSuccess && (
            <div
              className="mt-6 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                color: 'var(--accent)',
              }}
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('login.reset_success')}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="text-sm font-medium block"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('login.email')}
              </label>
              <div className="mt-2 relative">
                <Mail
                  className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden="true"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.email_placeholder')}
                  className="w-full ps-10 pe-4 py-3 rounded-xl text-sm transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
                    e.currentTarget.style.boxShadow   = '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow   = 'none'
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t('login.password')}
                </label>
                <Link
                  href="/reset-password"
                  className="text-xs transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  {t('login.forgot')}
                </Link>
              </div>

              <div className="mt-2 relative">
                <Lock
                  className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full ps-10 pe-12 py-3 rounded-xl text-sm transition-all"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)'
                    e.currentTarget.style.boxShadow   = '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow   = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t('login.toggle_password')}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 -translate-y-1/2 end-3 w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <span className="relative w-4 h-4 block">
                    <Eye
                      className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${
                        showPassword ? 'opacity-0 scale-75 -rotate-12' : 'opacity-100 scale-100 rotate-0'
                      }`}
                    />
                    <EyeOff
                      className={`absolute inset-0 w-4 h-4 transition-all duration-200 ${
                        showPassword ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-12'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 p-3 rounded-xl text-sm"
                style={{
                  background: 'rgba(244, 63, 94, 0.10)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  color: '#fb7185',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 10px 30px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
              onMouseEnter={(e) => {
                if (loading) return
                e.currentTarget.style.boxShadow = '0 14px 40px -10px var(--accent-glow), 0 0 30px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 10px 30px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.15)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('login.submitting')}
                </>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>

          {/* Sign-up footer */}
          <div
            className="mt-8 pt-6 border-t text-center text-sm"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {t('login.signup_prompt')}{' '}
            <Link
              href="/register"
              className="font-medium ms-1 transition-colors"
              style={{ color: 'var(--accent)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            >
              {t('login.signup_link')}
            </Link>
          </div>
        </div>

        {/* Legal */}
        <p
          className="mt-8 text-xs text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <bdi>{t('login.copyright')}</bdi>
        </p>
      </div>
    </div>
  )
}
