import { useState, type FormEvent } from "react";
import { signIn } from "@/api/desktop-commands";
import { errorMessage } from "@/shared/error-message";

type SignInFormProps = { onSignedIn: () => void };

export function SignInForm({ onSignedIn }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn({ email, password });
      onSignedIn();
    } catch (reason) {
      setError(errorMessage(reason, "Sign-in failed. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card w-[min(400px,90vw)] gap-5 p-8" onSubmit={handleSubmit}>
      <h1 className="text-title font-semibold">Sign in to Post Anki</h1>
      <label className="field-label">
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          className="field"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="field-label">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          className="field"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary mt-1" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
