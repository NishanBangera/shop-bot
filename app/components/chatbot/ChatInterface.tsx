import { useState, useRef, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Card,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Icon,
  Divider,
} from "@shopify/polaris";
import {
  ChatIcon,
  SendIcon,
  PersonIcon,
  CartIcon,
  SearchIcon,
  CreditCardIcon,
} from "@shopify/polaris-icons";

// Types
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatInterfaceProps {
  sessionId: string;
  initialMessages?: ChatMessage[];
}

export function ChatInterface({ sessionId, initialMessages = [] }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const response = fetcher.data as {
        success: boolean;
        message?: string;
        response?: string;
        error?: string;
      };

      if (response.success && response.response) {
        // Remove loading message and add actual response
        setMessages(prev => {
          const filtered = prev.filter(msg => !msg.isLoading);
          return [
            ...filtered,
            {
              id: `msg_${Date.now()}_assistant`,
              role: "assistant",
              content: response.response!,
              timestamp: new Date(),
            },
          ];
        });
      } else if (response.error) {
        // Handle error
        setMessages(prev => {
          const filtered = prev.filter(msg => !msg.isLoading);
          return [
            ...filtered,
            {
              id: `msg_${Date.now()}_error`,
              role: "assistant",
              content: `Sorry, I encountered an error: ${response.error}`,
              timestamp: new Date(),
            },
          ];
        });
      }
      setIsTyping(false);
    }
  }, [fetcher.data, fetcher.state]);

  const handleSendMessage = () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    const loadingMessage: ChatMessage = {
      id: `msg_${Date.now()}_loading`,
      role: "assistant",
      content: "Thinking...",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setIsTyping(true);

    // Send to API
    fetcher.submit(
      {
        message: inputValue.trim(),
        sessionId: sessionId,
      },
      {
        method: "POST",
        action: "/api/chat",
      }
    );

    setInputValue("");
  };

  const getMessageIcon = (role: string) => {
    return role === "user" ? PersonIcon : ChatIcon;
  };

  return (
    <Card>
      <BlockStack gap="400">
        {/* Chat Header */}
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ChatIcon} tone="base" />
            <Text as="h2" variant="headingMd">
              Shopping Assistant
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Online
          </Text>
        </InlineStack>

        <Divider />

        {/* Messages Container */}
        <div
          style={{
            height: "500px",
            overflowY: "auto",
            backgroundColor: "var(--p-color-bg-surface-secondary)",
            borderRadius: "var(--p-border-radius-200)",
            padding: "1rem",
          }}
        >
          <BlockStack gap="300">
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "1rem" }}>
                <BlockStack gap="200">
                  <Icon source={ChatIcon} tone="subdued" />
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Welcome! I'm your shopping assistant. Ask me about products,
                    add items to your cart, or get help with your orders.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Try saying: "Show me running shoes" or "I'm looking for a winter jacket"
                  </Text>
                </BlockStack>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                icon={getMessageIcon(message.role)}
              />
            ))}
            <div ref={messagesEndRef} />
          </BlockStack>
        </div>

        {/* Input Area */}
        <InlineStack gap="200">
          <div style={{ flex: 1 }}>
            <TextField
              value={inputValue}
              onChange={setInputValue}
              placeholder="Type your message here..."
              autoComplete="off"
              disabled={isTyping}
              multiline={2}
              label=""
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            icon={SendIcon}
            variant="primary"
            size="large"
          >
            Send
          </Button>
        </InlineStack>

        {/* Quick Actions */}
        <InlineStack gap="200" wrap={false}>
          <Button
            size="slim"
            icon={SearchIcon}
            onClick={() => setInputValue("Show me popular products")}
            disabled={isTyping}
          >
            Browse Products
          </Button>
          <Button
            size="slim"
            icon={CartIcon}
            onClick={() => setInputValue("Show me my cart")}
            disabled={isTyping}
          >
            View Cart
          </Button>
          <Button
            size="slim"
            icon={CreditCardIcon}
            onClick={() => setInputValue("Help me checkout")}
            disabled={isTyping}
          >
            Checkout Help
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// Message Bubble Component
interface MessageBubbleProps {
  message: ChatMessage;
  icon: any;
}

function MessageBubble({ message, icon }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isLoading = message.isLoading;

  return (
    <InlineStack
      gap="200"
      align={isUser ? "end" : "start"}
      blockAlign="start"
    >
      {!isUser && (
        <div
          style={{
            backgroundColor: "var(--p-color-bg-fill-brand)",
            borderRadius: "50%",
            minWidth: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
          }}
        >
          <Icon source={icon} tone="base" />
        </div>
      )}

      <div
        style={{
          backgroundColor: isUser
            ? "var(--p-color-bg-fill-brand)"
            : "var(--p-color-bg-surface)",
          color: isUser
            ? "var(--p-color-text-on-color)"
            : "var(--p-color-text)",
          borderRadius: "var(--p-border-radius-300)",
          maxWidth: "70%",
          wordWrap: "break-word",
          border: isUser
            ? "none"
            : "1px solid var(--p-color-border-subdued)",
          padding: "0.75rem",
        }}
      >
        <BlockStack gap="100">
          <Text as="p" variant="bodyMd">
            {isLoading ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" />
                <span>{message.content}</span>
              </InlineStack>
            ) : (
              message.content
            )}
          </Text>
          <Text as="p" variant="bodySm" tone={isUser ? "text-inverse" : "subdued"}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </BlockStack>
      </div>

      {isUser && (
        <div
          style={{
            backgroundColor: "var(--p-color-bg-fill-secondary)",
            borderRadius: "50%",
            minWidth: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
          }}
        >
          <Icon source={icon} tone="base" />
        </div>
      )}
    </InlineStack>
  );
}
