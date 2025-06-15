import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
// import { authenticate } from "../shopify.server";
import { v4 as uuidv4 } from "uuid";

// Types for our MCP tools
interface ProductQuery {
  query: string;
  limit?: number;
  collection_id?: string;
}

interface CartItem {
  product_id: string;
  variant_id: string;
  quantity: number;
}

interface Cart {
  id: string;
  items: CartItem[];
  created_at: string;
  updated_at: string;
}

// In-memory cart storage (in production, use database)
const carts = new Map<string, Cart>();

// MCP Server class for Shopify chatbot
export class ShopifyMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "shopify-chatbot-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    console.log("checkkkkkk", ListToolsRequestSchema)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "query_products",
            description: "Search and retrieve product information from Shopify store",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for products",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of products to return (default: 10)",
                  default: 10,
                },
                collection_id: {
                  type: "string",
                  description: "Optional collection ID to filter products",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "create_cart",
            description: "Initialize a new shopping cart session",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "add_to_cart",
            description: "Add specified products with quantities to cart",
            inputSchema: {
              type: "object",
              properties: {
                cart_id: {
                  type: "string",
                  description: "Cart ID to add items to",
                },
                items: {
                  type: "array",
                  description: "Array of items to add to cart",
                  items: {
                    type: "object",
                    properties: {
                      product_id: { type: "string" },
                      variant_id: { type: "string" },
                      quantity: { type: "number" },
                    },
                    required: ["product_id", "variant_id", "quantity"],
                  },
                },
              },
              required: ["cart_id", "items"],
            },
          },
          {
            name: "remove_from_cart",
            description: "Remove items from existing cart",
            inputSchema: {
              type: "object",
              properties: {
                cart_id: {
                  type: "string",
                  description: "Cart ID to remove items from",
                },
                item_ids: {
                  type: "array",
                  description: "Array of item IDs to remove",
                  items: { type: "string" },
                },
              },
              required: ["cart_id", "item_ids"],
            },
          },
          {
            name: "begin_checkout",
            description: "Initiate the checkout process",
            inputSchema: {
              type: "object",
              properties: {
                cart_id: {
                  type: "string",
                  description: "Cart ID to checkout",
                },
              },
              required: ["cart_id"],
            },
          },
          {
            name: "order_status",
            description: "Check status of existing orders",
            inputSchema: {
              type: "object",
              properties: {
                order_id: {
                  type: "string",
                  description: "Order ID to check status for",
                },
              },
              required: ["order_id"],
            },
          },
        ] as Tool[],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "query_products":
            return await this.queryProducts(args as ProductQuery);
          case "create_cart":
            return await this.createCart();
          case "add_to_cart":
            return await this.addToCart(args as any);
          case "remove_from_cart":
            return await this.removeFromCart(args as any);
          case "begin_checkout":
            return await this.beginCheckout(args as any);
          case "order_status":
            return await this.getOrderStatus(args as any);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async queryProducts(params: ProductQuery, request?: Request) {
    // If request is provided, use real Shopify API
    if (request) {
      try {
        const { ShopifyAPIService } = await import("./shopify-api");

        const products = await ShopifyAPIService.searchProducts(
          request,
          params.query,
          params.limit || 10,
          params.collection_id
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                products: products,
                query: params.query,
                total: products.length,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Failed to search products: ${error instanceof Error ? error.message : String(error)}`,
                query: params.query,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }

    // Fallback to mock data if no request provided
    const mockProducts = [
      {
        id: "gid://shopify/Product/1",
        title: "Sample Product 1",
        description: "A great product for testing",
        price: "$29.99",
        images: ["https://example.com/image1.jpg"],
        variants: [
          {
            id: "gid://shopify/ProductVariant/1",
            title: "Default Title",
            price: "$29.99",
            available: true,
          },
        ],
      },
    ];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            products: mockProducts,
            query: params.query,
            total: mockProducts.length,
          }, null, 2),
        },
      ],
    };
  }

  private async createCart() {
    const cartId = uuidv4();
    const cart: Cart = {
      id: cartId,
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    carts.set(cartId, cart);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ cart_id: cartId, message: "Cart created successfully" }),
        },
      ],
    };
  }

  private async addToCart(params: { cart_id: string; items: CartItem[] }) {
    const cart = carts.get(params.cart_id);
    if (!cart) {
      throw new Error("Cart not found");
    }

    cart.items.push(...params.items);
    cart.updated_at = new Date().toISOString();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: "Items added to cart successfully",
            cart: cart,
          }),
        },
      ],
    };
  }

  private async removeFromCart(params: { cart_id: string; item_ids: string[] }) {
    const cart = carts.get(params.cart_id);
    if (!cart) {
      throw new Error("Cart not found");
    }

    // Remove items by product_id (simplified logic)
    cart.items = cart.items.filter(item => !params.item_ids.includes(item.product_id));
    cart.updated_at = new Date().toISOString();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: "Items removed from cart successfully",
            cart: cart,
          }),
        },
      ],
    };
  }

  private async beginCheckout(params: { cart_id: string }) {
    const cart = carts.get(params.cart_id);
    if (!cart) {
      throw new Error("Cart not found");
    }

    if (cart.items.length === 0) {
      throw new Error("Cannot checkout empty cart");
    }

    // In a real implementation, this would create a Shopify checkout
    const checkoutUrl = `https://example.myshopify.com/checkout?cart=${params.cart_id}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: "Checkout initiated successfully",
            checkout_url: checkoutUrl,
            cart: cart,
          }),
        },
      ],
    };
  }

  private async getOrderStatus(params: { order_id: string }) {
    // Mock order status - in real implementation, query Shopify Orders API
    const mockOrder = {
      id: params.order_id,
      status: "fulfilled",
      total_price: "$59.98",
      created_at: "2024-01-15T10:30:00Z",
      tracking_number: "1Z999AA1234567890",
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            order: mockOrder,
          }),
        },
      ],
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Export singleton instance
export const mcpServer = new ShopifyMCPServer();
