import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InputMessage from './Input';
import { store } from '../../../store/ChatStore';
import { uiStore } from '../../../store/UIStore';

describe('InputMessage component', () => {
    beforeEach(() => {
        uiStore.replyToMessage = '';
        store.sendMessage = jest.fn();
    });

    test('renders InputMessage component', () => {
        render(<InputMessage />);
        const inputElement = screen.getByPlaceholderText('Type your message here...');
        expect(inputElement).toBeInTheDocument();
    });

    test('sends message when send button is clicked', async () => {
        render(<InputMessage />);
        const sendButton = screen.getByRole('button', { name: /send/i });
        const inputElement = screen.getByPlaceholderText('Type your message here...');
        fireEvent.change(inputElement, { target: { value: 'Test message' } });
        fireEvent.click(sendButton);
        await waitFor(() => expect(store.sendMessage).toHaveBeenCalled());
    });

    test('sends message when enter key is pressed', async () => {
        render(<InputMessage />);
        const inputElement = screen.getByPlaceholderText('Type your message here...');
        fireEvent.change(inputElement, { target: { value: 'Test message' } });
        fireEvent.keyDown(document, { key: 'Enter', code: 'Enter', ctrlKey: true });
        await waitFor(() => expect(store.sendMessage).toHaveBeenCalled());
    });
});