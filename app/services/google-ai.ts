import { GoogleGenerativeAI } from "@google/generative-ai";

// Types for conversation management
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    tool_calls?: string[];
    intent?: string;
    confidence?: number;
  };
}

export interface ConversationContext {
  session_id: string;
  messages: ChatMessage[];
  cart_id?: string;
  user_preferences?: {
    budget_range?: string;
    preferred_categories?: string[];
    size_preferences?: string[];
  };
  current_intent?: string;
  last_activity: Date;
}

// Intent types for mapping to MCP tools
export enum ChatIntent {
  PRODUCT_SEARCH = "product_search",
  ADD_TO_CART = "add_to_cart",
  REMOVE_FROM_CART = "remove_from_cart",
  VIEW_CART = "view_cart",
  CHECKOUT = "checkout",
  ORDER_STATUS = "order_status",
  GENERAL_HELP = "general_help",
  GREETING = "greeting",
}

export class GoogleAIService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private conversations = new Map<string, ConversationContext>();
  private isEnabled: boolean = false;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.warn(
        "GOOGLE_AI_API_KEY environment variable not set. AI features will use fallback responses.",
      );
      this.isEnabled = false;
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: this.getSystemPrompt(),
      });
      this.isEnabled = true;
    } catch (error) {
      console.error("Failed to initialize Google AI:", error);
      this.isEnabled = false;
    }
  }

  private getSystemPrompt(): string {
    return `You are a helpful Shopify store assistant chatbot. Your role is to help customers:

1. Find products they're looking for
2. Add items to their shopping cart
3. Manage their cart (add/remove items)
4. Guide them through checkout
5. Check order status
6. Provide general shopping assistance

IMPORTANT GUIDELINES:
- Always be friendly, helpful, and professional
- Ask clarifying questions when product searches are vague
- Suggest related or complementary products when appropriate
- Provide clear pricing and availability information
- Guide users through the shopping process step by step
- If you need to use tools, explain what you're doing
- Handle errors gracefully and offer alternatives

AVAILABLE TOOLS:
- query_products: Search for products
- create_cart: Create a new shopping cart
- add_to_cart: Add items to cart
- remove_from_cart: Remove items from cart
- begin_checkout: Start checkout process
- order_status: Check order status

Always respond in a conversational, helpful manner. If you're unsure about something, ask for clarification rather than making assumptions.`;
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    existingContext?: ConversationContext,
  ): Promise<{
    response: string;
    intent: ChatIntent;
    toolCalls: Array<{ tool: string; params: any }>;
    updatedContext: ConversationContext;
  }> {
    // Get or create conversation context
    let context = existingContext || this.conversations.get(sessionId);
    if (!context) {
      context = {
        session_id: sessionId,
        messages: [],
        last_activity: new Date(),
      };
    }

    // Add user message to context
    const userChatMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    context.messages.push(userChatMessage);

    // Analyze intent
    const intent = await this.analyzeIntent(userMessage, context);

    // Generate response with tool calls if needed
    const { response, toolCalls } = await this.generateResponse(
      userMessage,
      context,
      intent,
    );

    // Add assistant message to context
    const assistantMessage: ChatMessage = {
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: response,
      timestamp: new Date(),
      metadata: {
        intent,
        tool_calls: toolCalls.map((tc) => tc.tool),
      },
    };
    context.messages.push(assistantMessage);

    // Update context
    context.current_intent = intent;
    context.last_activity = new Date();
    this.conversations.set(sessionId, context);

    return {
      response,
      intent,
      toolCalls,
      updatedContext: context,
    };
  }

  private async analyzeIntent(
    message: string,
    _context: ConversationContext,
  ): Promise<ChatIntent> {
    const lowerMessage = message.toLowerCase();

    // Simple intent detection based on keywords
    // In production, you might want to use more sophisticated NLP

    if (
      lowerMessage.includes("hello") ||
      lowerMessage.includes("hi") ||
      lowerMessage.includes("hey")
    ) {
      return ChatIntent.GREETING;
    }

    if (
      lowerMessage.includes("search") ||
      lowerMessage.includes("find") ||
      lowerMessage.includes("looking for") ||
      lowerMessage.includes("show me")
    ) {
      return ChatIntent.PRODUCT_SEARCH;
    }

    if (
      lowerMessage.includes("add to cart") ||
      lowerMessage.includes("buy") ||
      lowerMessage.includes("purchase")
    ) {
      return ChatIntent.ADD_TO_CART;
    }

    if (
      lowerMessage.includes("remove") ||
      lowerMessage.includes("delete") ||
      lowerMessage.includes("take out")
    ) {
      return ChatIntent.REMOVE_FROM_CART;
    }

    if (lowerMessage.includes("cart") || lowerMessage.includes("basket")) {
      return ChatIntent.VIEW_CART;
    }

    if (
      lowerMessage.includes("checkout") ||
      lowerMessage.includes("pay") ||
      lowerMessage.includes("order now")
    ) {
      return ChatIntent.CHECKOUT;
    }

    if (
      lowerMessage.includes("order status") ||
      lowerMessage.includes("track") ||
      lowerMessage.includes("delivery")
    ) {
      return ChatIntent.ORDER_STATUS;
    }

    return ChatIntent.GENERAL_HELP;
  }

  private async generateResponse(
    message: string,
    context: ConversationContext,
    intent: ChatIntent,
  ): Promise<{
    response: string;
    toolCalls: Array<{ tool: string; params: any }>;
  }> {
    const toolCalls: Array<{ tool: string; params: any }> = [];

    // Build conversation history for context
    const conversationHistory = context.messages
      .slice(-10) // Keep last 10 messages for context
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    let prompt = `Based on this conversation history:\n${conversationHistory}\n\nUser's latest message: "${message}"\nDetected intent: ${intent}\n\n`;

    switch (intent) {
      case ChatIntent.GREETING:
        return {
          response:
            "Hello! Welcome to our store! 👋 I'm here to help you find amazing products and make your shopping experience smooth. What can I help you with today?",
          toolCalls: [],
        };

      case ChatIntent.PRODUCT_SEARCH:
        // Extract search terms from the message
        const searchQuery = this.extractSearchQuery(message);
        if (searchQuery) {
          toolCalls.push({
            tool: "query_products",
            params: { query: searchQuery, limit: 5 },
          });
          return {
            response: `Let me search for "${searchQuery}" in our store... 🔍`,
            toolCalls,
          };
        } else {
          return {
            response:
              "I'd be happy to help you find products! Could you tell me what you're looking for? For example, you could say 'I'm looking for running shoes' or 'Show me winter jackets'.",
            toolCalls: [],
          };
        }

      case ChatIntent.ADD_TO_CART:
        if (!context.cart_id) {
          toolCalls.push({
            tool: "create_cart",
            params: {},
          });
        }
        return {
          response:
            "I'll help you add items to your cart! Let me set that up for you... 🛒",
          toolCalls,
        };

      case ChatIntent.VIEW_CART:
        if (context.cart_id) {
          return {
            response: "Let me show you what's in your cart...",
            toolCalls: [],
          };
        } else {
          return {
            response:
              "Your cart is currently empty. Would you like me to help you find some products to add?",
            toolCalls: [],
          };
        }

      case ChatIntent.CHECKOUT:
        if (context.cart_id) {
          toolCalls.push({
            tool: "begin_checkout",
            params: { cart_id: context.cart_id },
          });
          return {
            response: "Great! Let me start the checkout process for you... 💳",
            toolCalls,
          };
        } else {
          return {
            response:
              "You don't have any items in your cart yet. Would you like me to help you find some products first?",
            toolCalls: [],
          };
        }

      case ChatIntent.ORDER_STATUS:
        const orderId = this.extractOrderId(message);
        if (orderId) {
          toolCalls.push({
            tool: "order_status",
            params: { order_id: orderId },
          });
          return {
            response: `Let me check the status of order ${orderId}... 📦`,
            toolCalls,
          };
        } else {
          return {
            response:
              "I can help you check your order status! Please provide your order number (it usually starts with # followed by numbers).",
            toolCalls: [],
          };
        }

      default:
        // Use AI to generate a contextual response if available
        if (this.isEnabled && this.model) {
          try {
            const result = await this.model.generateContent(
              prompt +
                "Please provide a helpful response as a shopping assistant.",
            );
            return {
              response:
                result.response.text() ||
                "I'm here to help! You can ask me to search for products, manage your cart, or check order status. What would you like to do?",
              toolCalls: [],
            };
          } catch (error) {
            console.error("AI generation error:", error);
          }
        }

        // Fallback response when AI is not available
        return {
          response:
            "I'm here to help with your shopping! You can ask me to search for products, add items to cart, or check your orders. What can I do for you?",
          toolCalls: [],
        };
    }
  }

  private extractSearchQuery(message: string): string | null {
    // Simple extraction - in production, use more sophisticated NLP
    const patterns = [
      /looking for (.+)/i,
      /search for (.+)/i,
      /find (.+)/i,
      /show me (.+)/i,
      /i want (.+)/i,
      /need (.+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no pattern matches, return the whole message as search query
    // but filter out common stop words
    const stopWords = [
      "i",
      "am",
      "looking",
      "for",
      "a",
      "an",
      "the",
      "some",
      "any",
    ];
    const words = message
      .toLowerCase()
      .split(" ")
      .filter((word) => !stopWords.includes(word));
    return words.length > 0 ? words.join(" ") : null;
  }

  private extractOrderId(message: string): string | null {
    // Look for order ID patterns like #12345 or order 12345
    const patterns = [/#(\d+)/, /order\s+(\d+)/i, /order\s+#(\d+)/i];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  getConversationContext(sessionId: string): ConversationContext | undefined {
    return this.conversations.get(sessionId);
  }

  clearConversation(sessionId: string): void {
    this.conversations.delete(sessionId);
  }

  // Clean up old conversations (call periodically)
  cleanupOldConversations(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    for (const [sessionId, context] of this.conversations.entries()) {
      if (context.last_activity < cutoffTime) {
        this.conversations.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
export const googleAIService = new GoogleAIService();
