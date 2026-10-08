import { type LogInInput, logInSchema } from '@chat/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { useLogIn } from './queries';

export function LogInForm() {
  const logIn = useLogIn();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof logInSchema>, unknown, LogInInput>({
    resolver: zodResolver(logInSchema),
    defaultValues: { username: '', password: '' },
  });

  return (
    // the same zod schema the server validates with; the server's refusal arrives as a toast
    <form onSubmit={handleSubmit((values) => logIn.mutate(values))} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="login-username">Username</FieldLabel>
          <Input
            id="login-username"
            autoComplete="username"
            aria-invalid={!!errors.username}
            {...register('username')}
          />
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        <Button type="submit" size="lg" disabled={logIn.isPending}>
          {logIn.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </FieldGroup>
    </form>
  );
}
