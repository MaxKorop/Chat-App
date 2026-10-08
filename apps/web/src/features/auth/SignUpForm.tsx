import { type SignUpInput, signUpSchema } from '@chat/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { useSignUp } from './queries';

export function SignUpForm() {
  const signUp = useSignUp();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof signUpSchema>, unknown, SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', username: '', password: '' },
  });

  return (
    <form onSubmit={handleSubmit((values) => signUp.mutate(values))} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="signup-username">Username</FieldLabel>
          <Input
            id="signup-username"
            autoComplete="username"
            aria-invalid={!!errors.username}
            {...register('username')}
          />
          <FieldDescription>2 to 25 letters, digits, "_" or "."</FieldDescription>
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          <FieldDescription>At least 8 characters</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>
        <Button type="submit" size="lg" disabled={signUp.isPending}>
          {signUp.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </FieldGroup>
    </form>
  );
}
