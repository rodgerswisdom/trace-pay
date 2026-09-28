import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/home",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e;
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 md:bg-muted/40">
      <div className="flex w-full max-w-sm flex-col gap-8 md:rounded-2xl md:border md:bg-background md:p-8 md:shadow-sm">
        <div>
          <Logo height={28} priority />
          <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your deals, your proof, your money.</p>
        </div>
        <form action={login} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-12 text-base" />
          </div>
          {error && <p className="text-sm text-destructive">That email and password don&apos;t match.</p>}
          <Button type="submit" className="h-12 w-full text-base">Sign in</Button>
        </form>
      </div>
    </main>
  );
}
