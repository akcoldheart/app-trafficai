import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
<button>Click me</button>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  
  if (loading) return <p className="text-center mt-10">Loading...</p>;

  if (!user) {
    return (
      <div className="text-center mt-10">
        <p>You must be logged in to access this dashboard.</p>
        <a href="/login">
          <Button className="mt-4">Go to Login</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Welcome, {user.email}</h1>
      <p className="mb-6">This is your dashboard.</p>

      <div className="grid gap-4">
        <div className="rounded-xl border p-4 shadow">
          <h2 className="text-lg font-semibold mb-2">My Pixel Data</h2>
          <p className="text-muted-foreground">Coming soon: View pixel activity connected to your account.</p>
        </div>

        <div className="rounded-xl border p-4 shadow">
          <h2 className="text-lg font-semibold mb-2">Run Audience Search</h2>
          <p className="text-muted-foreground">You’ll soon be able to run searches using Audience Labs API here.</p>
        </div>
      </div>

      <Button className="mt-6" onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}>
        Sign Out
      </Button>
    </div>
  );
}
