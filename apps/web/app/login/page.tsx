'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { api, describeError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { PasswordField } from '@/components/ui/password-field'
import { AuthBackdrop } from '@/components/auth-backdrop'
import { BrandMark } from '@/components/brand-mark'
import { Skeleton } from '@/components/ui/skeleton'
import { safeReturnTo } from '@/lib/safe-return-to'

function LoginForm() {
    const router = useRouter()
    const params = useSearchParams()
    const returnTo = safeReturnTo(params.get('returnTo'))
    const expired = params.get('reason') === 'expired'
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    async function onSubmit(event: FormEvent) {
        event.preventDefault()
        setError(null)
        setPending(true)

        try {
            await api('/auth/login', { method: 'POST', body: { email, password } })
            router.push(returnTo)
        } catch (err) {
            setError(describeError(err, 'Something went wrong').detail)
            setPending(false)
        }
    }

    return (
        <main
            id="main"
            className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-16"
        >
            <AuthBackdrop />

            <div className="relative z-10 mx-auto flex w-full max-w-md flex-col">
                {/* The header block centres as a unit. A centred mark above a
                    left-aligned heading has nothing to line up with and reads
                    as a mistake; the form fields below stay left-aligned,
                    because labels must. 48px rather than 34px so the mark has
                    presence instead of floating. */}
                <div className="mb-8 flex flex-col items-center text-center">
                    <Link href="/" aria-label="Face-Off home">
                        <BrandMark size={48} showWordmark={false} priority />
                    </Link>

                    <h1 className="mt-5 text-3xl">Sign in</h1>
                    <p className="mt-2 text-[15px] text-ink-dim">
                        Welcome back. Let&apos;s get you competing.
                    </p>
                </div>

                {/* Says the two things a participant bounced out mid-round needs
                    to know: why they are here, and that their work survived. */}
                {expired && (
                    <div
                        role="status"
                        className="mb-5 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-[14px] text-ink-dim"
                    >
                        Your session ended. Sign in again.
                    </div>
                )}

                {/*
        method="post" matters even though onSubmit handles the request. A form
        with no method defaults to GET, so if hydration ever fails this form
        becomes inert HTML and the browser submits the password in the query
        string — into history, access logs and Referer headers. With POST the
        worst case puts it in a request body instead.
      */}
                <form method="post" onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
                    <Field
                        label="Email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <PasswordField
                        label="Password"
                        name="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    {error && (
                        <p
                            role="alert"
                            className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger"
                        >
                            {error}
                        </p>
                    )}

                    <Button type="submit" size="lg" loading={pending} className="w-full">
                        Sign in
                    </Button>
                </form>

                <p className="mt-4 text-[14px]">
                    <Link
                        href="/forgot-password"
                        className="text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim"
                    >
                        Forgot your password?
                    </Link>
                </p>

                <p className="mt-2 text-[14px] text-ink-faint">
                    No account yet?{' '}
                    <Link
                        href="/register"
                        className="text-brand-bright underline underline-offset-4"
                    >
                        Create one
                    </Link>
                </p>
            </div>
        </main>
    )
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-dvh items-center justify-center px-5">
                    <Skeleton className="h-96 w-full max-w-md rounded-xl" />
                </main>
            }
        >
            <LoginForm />
        </Suspense>
    )
}
