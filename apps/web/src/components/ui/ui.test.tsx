// The UI is built from these shadcn/Radix primitives, so this file proves they work in the test
// environment (jsdom) before any screen depends on them.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { cn } from '@/lib/utils';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { Avatar, AvatarFallback } from './avatar';
import { Badge } from './badge';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Input } from './input';
import { Toaster } from './sonner';
import { Switch } from './switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Textarea } from './textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Button', () => {
  it('calls its handler when clicked, and not when disabled', async () => {
    const onClick = vi.fn<() => void>();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has visually different variants', () => {
    render(
      <>
        <Button>Default</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Delete' }).className).not.toBe(
      screen.getByRole('button', { name: 'Default' }).className,
    );
    expect(cn(screen.getByRole('button', { name: 'Delete' }).className)).toContain('destructive');
  });
});

describe('Dialog', () => {
  function Example() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create chat</DialogTitle>
            <DialogDescription>Pick some friends</DialogDescription>
          </DialogHeader>
          <Input aria-label="Name" />
        </DialogContent>
      </Dialog>
    );
  }

  it('opens from its trigger as a labelled dialog and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Example />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog', { name: 'Create chat' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('AlertDialog', () => {
  it('asks before a destructive action and runs it only on confirmation', async () => {
    const onConfirm = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ContextMenu', () => {
  it('opens on right click and runs the chosen action (this is how message actions work)', async () => {
    const onReply = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <ContextMenu>
        <ContextMenuTrigger>a message</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onReply}>Reply</ContextMenuItem>
          <ContextMenuItem>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('a message') });
    await user.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});

describe('Switch and Checkbox', () => {
  it('toggle their checked state', async () => {
    const user = userEvent.setup();
    function Example() {
      const [on, setOn] = useState(false);
      return <Switch aria-label="Public" checked={on} onCheckedChange={setOn} />;
    }
    render(
      <>
        <Example />
        <Checkbox aria-label="Alice" />
      </>,
    );
    const toggle = screen.getByRole('switch', { name: 'Public' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    const box = screen.getByRole('checkbox', { name: 'Alice' });
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Tabs', () => {
  it('shows the panel of the selected tab', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="direct">
        <TabsList>
          <TabsTrigger value="direct">Direct</TabsTrigger>
          <TabsTrigger value="group">Group</TabsTrigger>
        </TabsList>
        <TabsContent value="direct">pick a friend</TabsContent>
        <TabsContent value="group">name the group</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('pick a friend')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Group' }));
    expect(screen.getByText('name the group')).toBeInTheDocument();
    expect(screen.queryByText('pick a friend')).not.toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('shows its text on hover', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>12:30</Button>
          </TooltipTrigger>
          <TooltipContent>05.01.2026 12:30</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole('button', { name: '12:30' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('05.01.2026 12:30');
  });
});

describe('Avatar, Badge, Textarea', () => {
  it('render their content (the image never loads in jsdom, so the fallback shows)', () => {
    render(
      <>
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Badge>3</Badge>
        <Textarea aria-label="Message" defaultValue="hello" />
      </>,
    );
    expect(screen.getByText('AB')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('hello');
  });
});

describe('Toaster (sonner)', () => {
  it('displays an error toast', async () => {
    render(<Toaster />);
    toast.error('Message not delivered');
    expect(await screen.findByText('Message not delivered')).toBeInTheDocument();
  });
});
