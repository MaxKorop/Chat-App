import React from 'react';
import { render, screen } from '@testing-library/react';
import Message from './Message';
import { MessageProps } from '../../../../types/componentsProps';

describe('Message component', () => {
	const mockMessage: MessageProps['message'] = {
		_id: '1',
		payload: 'Test message',
		sentBy: 'sender',
		sentByName: 'Sender name',
		sentAt: new Date(),
		repliedTo: '',
		readBy: '',
		media: [],
		status: 'Sent',
		modified: false
	};

	test('renders message payload', () => {
		render(<Message message={mockMessage} setHeightToScroll={() => {}} />);
		const payloadElement = screen.getByText('Test message');
		expect(payloadElement).toBeInTheDocument();
	});
	
	test('displays message sender if different from current user', () => {
		render(<Message message={mockMessage} setHeightToScroll={() => {}} />);
		const senderElement = screen.getByText('Sender Name', { exact: false });
		expect(senderElement).toBeInTheDocument();
	});
	
	test('does not display message sender if it is the current user', () => {
		const currentUserMessage = { ...mockMessage, sentByName: 'Current User' };
		render(<Message message={currentUserMessage} setHeightToScroll={() => {}} />);
		const senderElement = screen.queryByText('Sender Name', { exact: false });
		expect(senderElement).not.toBeInTheDocument();
	});
	
	test('displays sent time in correct format', () => {
		render(<Message message={mockMessage} setHeightToScroll={() => {}} />);
		const timeElement = screen.queryByText(/\d{2}:\d{2}/);
		expect(timeElement).toBeInTheDocument();
	});
});

