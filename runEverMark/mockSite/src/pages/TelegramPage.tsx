
import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { readSession } from '../utils/session';
import { Paperclip, Send, File as FileIcon } from 'lucide-react';

interface Attachment {
  type: 'image' | 'file';
  url: string;
  name?: string;
}

interface Message {
  id: number;
  text: string;
  sender: 'me' | 'other';
  time: string;
  attachment?: Attachment;
}

interface Chat {
  id: number;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  messages: Message[];
}

const initialChats: Chat[] = [
  {
    id: 1,
    name: 'Pavel Durov',
    avatar: 'https://img.pokemondb.net/sprites/home/normal/pikachu.png',
    lastMessage: 'Check out the new features!',
    time: '12:30',
    unread: 2,
    messages: [
      { id: 1, text: 'Hi there!', sender: 'other', time: '12:00' },
      { id: 2, text: 'How do you like the new update?', sender: 'other', time: '12:01' },
      { id: 3, text: 'It looks great!', sender: 'me', time: '12:05' },
      { id: 4, text: 'Check out the new features!', sender: 'other', time: '12:30' },
    ],
  },
  {
    id: 2,
    name: 'React Developers',
    avatar: 'https://img.pokemondb.net/sprites/home/normal/psyduck.png',
    lastMessage: 'Anyone know how to use hooks?',
    time: '11:15',
    unread: 0,
    messages: [
      { id: 5, text: 'Anyone know how to use hooks?', sender: 'other', time: '11:15' },
    ],
  },
  {
    id: 3,
    name: 'Family Content',
    avatar: 'https://img.pokemondb.net/sprites/home/normal/togepi.png',
    lastMessage: 'Dinner at 7?',
    time: 'Yesterday',
    unread: 5,
    messages: [
      { id: 6, text: 'Dinner at 7?', sender: 'other', time: 'Yesterday' },
    ],
  },
];

let timer: any = null;

export default function TelegramPage() {
  const entryPoint = readSession<string>('runEverMark_active_entryPoint', '');

  const [chats, setChats] = useState<Chat[]>(() => {
    if (entryPoint === '#/pos/pro') {
      const dillion: Chat = {
        id: 999,
        name: 'Manager Dillion',
        avatar: 'https://img.pokemondb.net/sprites/home/normal/snorlax.png',
        lastMessage: 'You are welcome.',
        time: '09:00',
        unread: 0,
        messages: [
          { id: 7, text: 'Please confirm order 123.', sender: 'me', time: '09:00' },
          { id: 8, text: 'Looks good to me', sender: 'other', time: '09:15' },
           { id: 9, text: 'Thank you, will submit', sender: 'me', time: '09:15' },
          { id: 10, text: 'You are welcome.', sender: 'other', time: '09:16' },
        ],
      };
      return [dillion, ...initialChats];
    }
    return initialChats;
  });

  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [inputText, setInputText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  // Auto-response logic for Manager Dillion
  useEffect(() => {
    if (selectedChat?.id === 999) { // Manager Dillion
       const lastMsg = selectedChat.messages[selectedChat.messages.length - 1];
       if (lastMsg && lastMsg.sender === 'me' && lastMsg.text.length) {
        if(timer===undefined) {
           return;
         }
         if(timer!==null) {
           clearTimeout(timer);
         }
         timer = setTimeout(() => {
               timer = undefined;
               const response: Message = {
                   id: Date.now(),
                   text: "Looks good to me, but could you go back to edit remark add the client is vip. then it can submit.",
                   sender: 'other',
                   time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
               };
               updateChatWithNewMessage(999, response);
           }, 10000);
           return () => clearTimeout(timer);
       }
    }
  }, [chats]); // Re-run when chats change (new message added)


  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedChat) return;

    const newMessage: Message = {
      id: Date.now(),
      text: inputText,
      sender: 'me',
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };

    updateChatWithNewMessage(selectedChat.id, newMessage);
    setInputText('');
  };

  const updateChatWithNewMessage = (chatId: number, newMessage: Message) => {
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            lastMessage: newMessage.attachment
              ? (newMessage.attachment.type === 'image' ? '📷 Photo' : '📎 File')
              : newMessage.text,
            time: newMessage.time,
            messages: [...chat.messages, newMessage],
          };
        }
        return chat;
      })
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && selectedChat) {
      Array.from(e.target.files).forEach((file) => {
        const isImage = file.type.startsWith('image/');

        if (isImage) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const newMessage: Message = {
              id: Date.now() + Math.random(),
              text: '',
              sender: 'me',
              time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              attachment: {
                type: 'image',
                url: event.target?.result as string,
                name: file.name
              }
            };
            updateChatWithNewMessage(selectedChat.id, newMessage);
          };
          reader.readAsDataURL(file);
        } else {
          // Generic file handler
          const newMessage: Message = {
            id: Date.now() + Math.random(),
            text: '',
            sender: 'me',
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            attachment: {
              type: 'file',
              url: '#', // In a real app this would be a blob url or upload url
              name: file.name
            }
          };
          updateChatWithNewMessage(selectedChat.id, newMessage);
        }
      });
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages]);

  return (
    <div className="telegram-container">
      <div className="telegram-sidebar">
        <div className="telegram-search">
          <input type="text" placeholder="Search" />
        </div>
        <div className="telegram-chat-list">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`telegram-chat-item ${
                selectedChatId === chat.id ? 'active' : ''
              }`}
              onClick={() => setSelectedChatId(chat.id)}
            >
              <img src={chat.avatar} alt={chat.name} className="telegram-avatar" />
              <div className="telegram-chat-info">
                <div className="telegram-chat-header">
                  <span className="telegram-chat-name">{chat.name}</span>
                  <span className="telegram-chat-time">{chat.time}</span>
                </div>
                <div className="telegram-chat-preview">
                  <span className="telegram-last-message">{chat.lastMessage}</span>
                  {chat.unread > 0 && (
                    <span className="telegram-unread-badge">{chat.unread}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="telegram-main">
        {selectedChat ? (
          <>
            <div className="telegram-header">
              <div className="telegram-header-info">
                <span className="telegram-header-name">{selectedChat.name}</span>
                <span className="telegram-header-status">last seen recently</span>
              </div>
            </div>
            <div className="telegram-messages" role="log">
              {selectedChat.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`telegram-message ${
                    msg.sender === 'me' ? 'sent' : 'received'
                  }`}
                >
                  <div className="telegram-message-content">
                    {msg.attachment?.type === 'image' && (
                      <div className="telegram-attachment-image">
                          <img src={msg.attachment.url} alt="attachment" />
                      </div>
                    )}
                     {msg.attachment?.type === 'file' && (
                      <div className="telegram-attachment-file">
                          <FileIcon size={16} className="telegram-icon inline-block mr-1" /> {msg.attachment.name}
                      </div>
                    )}
                    {msg.text && <div className="telegram-text">{msg.text}</div>}
                    <span className="telegram-message-time">{msg.time}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="telegram-input-area">
              <button className="telegram-attach-btn" onClick={handleFileClick}>
                 <Paperclip size={24} />
              </button>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                style={{display: 'none'}}
                onChange={handleFileChange}
              />
              <input
                type="text"
                placeholder="Write a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="telegram-send-btn" onClick={handleSendMessage}>
                <Send size={24} />
              </button>
            </div>
          </>
        ) : (
          <div className="telegram-no-chat">Select a chat to start messaging</div>
        )}
      </div>
       <style>{`
        .telegram-container {
          display: flex;
          height: 80vh;
          width: 80vw;
          margin: 0 auto; /* Center horizontally */
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #fff;
          color: #000;
        }
        .telegram-sidebar {
          width: 320px;
          border-right: 1px solid #dfe1e5;
          display: flex;
          flex-direction: column;
        }
        .telegram-search {
          padding: 10px;
        }
        .telegram-search input {
          width: 100%;
          padding: 8px;
          border-radius: 20px;
          border: 1px solid #dfe1e5;
          background-color: #f1f3f4;
          outline: none;
        }
        .telegram-chat-list {
          flex: 1;
          overflow-y: auto;
        }
        .telegram-chat-item {
          display: flex;
          padding: 10px;
          cursor: pointer;
        }
        .telegram-chat-item:hover {
          background-color: #f1f3f4;
        }
        .telegram-chat-item.active {
          background-color: #3390ec;
          color: white;
        }
        .telegram-chat-item.active .telegram-last-message {
            color: #cceeff;
        }
        .telegram-chat-item.active .telegram-chat-time {
            color: #cceeff;
        }

        .telegram-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          margin-right: 10px;
        }
        .telegram-chat-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
        }
        .telegram-chat-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .telegram-chat-name {
          font-weight: 600;
        }
        .telegram-chat-time {
          font-size: 12px;
          color: #888;
        }
        .telegram-chat-preview {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .telegram-last-message {
          font-size: 14px;
          color: #888;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .telegram-unread-badge {
          background-color: #c4c9cc;
          color: white;
          border-radius: 10px;
          padding: 0 6px;
          font-size: 12px;
          min-width: 20px;
          text-align: center;
        }
        .telegram-chat-item.active .telegram-unread-badge {
            background-color: white;
            color: #3390ec;
        }

        .telegram-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background-color: #87aacf; /* Default wallpaper color */
          background-image: url('https://web.telegram.org/img/bg_0.png'); /* Pattern if available, else fallback */
          background-size: cover;
        }
        .telegram-header {
          padding: 10px 20px;
          background-color: white;
          border-bottom: 1px solid #dfe1e5;
          display: flex;
          align-items: center;
        }
        .telegram-header-name {
          font-weight: 600;
          font-size: 16px;
          display: block;
        }
        .telegram-header-status {
          font-size: 13px;
          color: #888;
        }
        .telegram-messages {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .telegram-message {
          max-width: 70%;
          display: flex;
        }
        .telegram-message.sent {
          align-self: flex-end;
        }
        .telegram-message.received {
          align-self: flex-start;
        }
        .telegram-message-content {
          padding: 8px 12px;
          border-radius: 8px;
          position: relative;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
          font-size: 15px;
          line-height: 1.4;
        }
        .telegram-message.received .telegram-message-content {
          background-color: white;
          border-top-left-radius: 0;
        }
        .telegram-message.sent .telegram-message-content {
          background-color: #effdde;
          border-bottom-right-radius: 0;
        }
        .telegram-message-time {
          font-size: 11px;
          color: #a0acb6;
          float: right;
          margin-left: 8px;
          margin-top: 6px;
        }
        .telegram-message.sent .telegram-message-time {
             color: #5bb46f;
        }

        .telegram-attachment-image img {
            max-width: 200px;
            max-height: 200px;
            border-radius: 4px;
            display: block;
            margin-bottom: 5px;
            object-fit: contain;
        }
        .telegram-attachment-file {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            font-weight: 500;
        }

        .telegram-input-area {
          padding: 10px 20px;
          background-color: white;
          display: flex;
          align-items: center;
        }
        .telegram-input-area input[type="text"] {
          flex: 1;
          padding: 12px;
          border: none;
          outline: none;
          font-size: 15px;
        }
        .telegram-send-btn, .telegram-attach-btn {
          background: none;
          border: none;
          color: #3390ec;
          font-size: 24px;
          cursor: pointer;
          margin-left: 10px;
        }
        .telegram-attach-btn {
            margin-left: 0;
            margin-right: 10px;
            font-size: 20px;
            color: #707579;
            display: flex;
            align-items: center;
        }

        .telegram-icon {
            display: inline-block;
            margin-right: 4px;
            vertical-align: middle;
        }

        .telegram-no-chat {
          display: flex;
          justify-content: center;
          align-items: center;
          height: auto;
          margin: auto;
          color: white;
          font-size: 14px;
          background-color: rgba(0,0,0,0.2);
          border-radius: 20px;
          padding: 5px 15px;
          align-self: center;
        }

      `}</style>
    </div>
  );
}
