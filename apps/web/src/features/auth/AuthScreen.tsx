import { BrandMark } from '@/components/brand-mark';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { LogInForm } from './LogInForm';
import { SignUpForm } from './SignUpForm';

/** What a visitor without a session sees. */
export function AuthScreen() {
  return (
    <main className="bg-chat-background flex min-h-dvh items-center justify-center p-4">
      <div className="bg-card w-full max-w-sm space-y-6 rounded-2xl border p-8 shadow-lg">
        <header className="flex flex-col items-center gap-2 text-center">
          <BrandMark className="size-14 drop-shadow-md" />
          <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
          <p className="text-muted-foreground text-sm">
            Log in or create an account to start chatting
          </p>
        </header>
        <Tabs defaultValue="login">
          <TabsList className="w-full">
            <TabsTrigger value="login">Log in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="pt-4">
            <LogInForm />
          </TabsContent>
          <TabsContent value="signup" className="pt-4">
            <SignUpForm />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
