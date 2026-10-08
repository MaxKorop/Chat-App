import { MessageCircle } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { LogInForm } from './LogInForm';
import { SignUpForm } from './SignUpForm';

/** What a visitor without a session sees. */
export function AuthScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="bg-card w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <header className="flex flex-col items-center gap-2 text-center">
          <MessageCircle className="text-primary size-8" aria-hidden />
          <h1 className="text-xl font-semibold">Chat</h1>
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
