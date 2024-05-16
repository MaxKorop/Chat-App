import { makeAutoObservable } from "mobx";

class UIStore {
    private _showAuthModal: boolean = true;
    private _showChatInfo: boolean = false;
    private _showCreateChat: boolean = false;
    private _showUserSettings: boolean = false;
    private _selectedMessageId: string = '';
    private _replyToMessage: string = '';

    constructor() {
        makeAutoObservable(this);
    }

    get showAuthModal() {
        return this._showAuthModal;
    }

    set showAuthModal(value) {
        this._showAuthModal = value;
    }

    get showChatInfo() {
        return this._showChatInfo;
    }

    set showChatInfo(value) {
        this._showChatInfo = value;
    }

    get showCreateChat() {
        return this._showCreateChat;
    }

    set showCreateChat(value) {
        this._showCreateChat = value;
    }

    get showUserSettings() {
        return this._showUserSettings;
    }

    set showUserSettings(value) {
        this._showUserSettings = value;
    }

    get selectedMessageId() {
        return this._selectedMessageId;
    }

    set selectedMessageId(value) {
        this._selectedMessageId = value;
    }

    get replyToMessage() {
        return this._replyToMessage;
    }

    set replyToMessage(value) {
        this._replyToMessage = value;
    }
}

export const uiStore = new UIStore();