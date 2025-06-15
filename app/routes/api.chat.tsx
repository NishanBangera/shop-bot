import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { googleAIService } from "../services/google-ai";
import { ShopifyAPIService } from "../services/shopify-api";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  // Authenticate the request
  try {
    
    const auth = await authenticate.admin(request);
    console.log("Authenticating request...", auth);
  } catch (error) {
    console.log("Authentication failed", error);
    return json({ success: false, error: "Authentication failed" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const message = formData.get("message") as string;
    const sessionId = formData.get("sessionId") as string;

    if (!message || !sessionId) {
      return json({ 
        success: false, 
        error: "Message and sessionId are required" 
      }, { status: 400 });
    }

    // Process the message with Google AI
    const aiResponse = await googleAIService.processMessage(sessionId, message);
    
    // Execute any tool calls
    let finalResponse = aiResponse.response;
    
    if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
      const toolResults = await executeToolCalls(request, aiResponse.toolCalls, aiResponse.updatedContext);
      
      // Update the response based on tool results
      if (toolResults.length > 0) {
        finalResponse = await generateResponseWithToolResults(
          aiResponse.response,
          toolResults,
          aiResponse.intent
        );
      }
    }

    return json({
      success: true,
      response: finalResponse,
      intent: aiResponse.intent,
      sessionId: sessionId,
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }, { status: 500 });
  }
}

// Execute tool calls and return results
async function executeToolCalls(
  request: Request,
  toolCalls: Array<{ tool: string; params: any }>,
  context: any
): Promise<Array<{ tool: string; result: any; success: boolean }>> {
  const results = [];

  for (const toolCall of toolCalls) {
    try {
      let result;
      
      switch (toolCall.tool) {
        case "query_products":
          result = await executeProductQuery(request, toolCall.params);
          break;
          
        case "create_cart":
          result = await executeCreateCart();
          break;
          
        case "add_to_cart":
          result = await executeAddToCart(toolCall.params);
          break;
          
        case "remove_from_cart":
          result = await executeRemoveFromCart(toolCall.params);
          break;
          
        case "begin_checkout":
          result = await executeBeginCheckout(request, toolCall.params);
          break;
          
        case "order_status":
          result = await executeOrderStatus(request, toolCall.params);
          break;
          
        default:
          throw new Error(`Unknown tool: ${toolCall.tool}`);
      }

      results.push({
        tool: toolCall.tool,
        result,
        success: true,
      });
      
    } catch (error) {
      results.push({
        tool: toolCall.tool,
        result: { error: error instanceof Error ? error.message : String(error) },
        success: false,
      });
    }
  }

  return results;
}

// Tool execution functions
async function executeProductQuery(request: Request, params: { query: string; limit?: number }) {
  const products = await ShopifyAPIService.searchProducts(
    request,
    params.query,
    params.limit || 5
  );
  
  return {
    products,
    count: products.length,
    query: params.query,
  };
}

async function executeCreateCart() {
  // In a real implementation, this would create a cart in your system
  const cartId = `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    cart_id: cartId,
    message: "Cart created successfully",
    items: [],
  };
}

async function executeAddToCart(params: { cart_id: string; items: any[] }) {
  // In a real implementation, this would add items to the cart
  return {
    cart_id: params.cart_id,
    message: `Added ${params.items.length} item(s) to cart`,
    items: params.items,
  };
}

async function executeRemoveFromCart(params: { cart_id: string; item_ids: string[] }) {
  // In a real implementation, this would remove items from the cart
  return {
    cart_id: params.cart_id,
    message: `Removed ${params.item_ids.length} item(s) from cart`,
    removed_items: params.item_ids,
  };
}

async function executeBeginCheckout(request: Request, params: { cart_id: string }) {
  // In a real implementation, this would create a checkout URL
  // For now, we'll create a mock checkout URL
  try {
    const { admin } = await authenticate.admin(request);
    
    // Get shop domain for checkout URL
    const shopQuery = `
      query {
        shop {
          myshopifyDomain
        }
      }
    `;
    
    const shopResponse = await admin.graphql(shopQuery);
    const shopData = await shopResponse.json();
    const shopDomain = shopData.data.shop.myshopifyDomain;
    
    const checkoutUrl = `https://${shopDomain}/cart`;
    
    return {
      cart_id: params.cart_id,
      checkout_url: checkoutUrl,
      message: "Checkout initiated successfully",
    };
  } catch (error) {
    throw new Error(`Failed to create checkout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function executeOrderStatus(request: Request, params: { order_id: string }) {
  try {
    // Try to get the order from Shopify
    const order = await ShopifyAPIService.getOrder(request, params.order_id);
    
    if (!order) {
      return {
        order_id: params.order_id,
        message: "Order not found",
        found: false,
      };
    }
    
    return {
      order_id: params.order_id,
      order,
      found: true,
    };
  } catch (error) {
    // Return mock data if order lookup fails
    return {
      order_id: params.order_id,
      message: "Unable to retrieve order status at this time",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Generate enhanced response with tool results
async function generateResponseWithToolResults(
  originalResponse: string,
  toolResults: Array<{ tool: string; result: any; success: boolean }>,
  intent: string
): Promise<string> {
  let enhancedResponse = originalResponse;

  for (const toolResult of toolResults) {
    if (!toolResult.success) {
      enhancedResponse += `\n\n❌ Error with ${toolResult.tool}: ${toolResult.result.error}`;
      continue;
    }

    switch (toolResult.tool) {
      case "query_products":
        if (toolResult.result.products && toolResult.result.products.length > 0) {
          enhancedResponse = `I found ${toolResult.result.count} product(s) for "${toolResult.result.query}":\n\n`;
          
          toolResult.result.products.forEach((product: any, index: number) => {
            const price = product.variants[0]?.price || "Price not available";
            enhancedResponse += `${index + 1}. **${product.title}**\n`;
            enhancedResponse += `   💰 ${price}\n`;
            if (product.description) {
              enhancedResponse += `   📝 ${product.description.substring(0, 100)}${product.description.length > 100 ? '...' : ''}\n`;
            }
            if (product.variants[0]?.available) {
              enhancedResponse += `   ✅ In stock\n`;
            } else {
              enhancedResponse += `   ❌ Out of stock\n`;
            }
            enhancedResponse += `\n`;
          });
          
          enhancedResponse += "Would you like me to add any of these items to your cart? Just let me know which one interests you!";
        } else {
          enhancedResponse = `I couldn't find any products matching "${toolResult.result.query}". Try searching with different keywords or browse our categories.`;
        }
        break;

      case "create_cart":
        enhancedResponse = `🛒 Great! I've created a new shopping cart for you (ID: ${toolResult.result.cart_id}). You can now start adding products to it!`;
        break;

      case "add_to_cart":
        enhancedResponse = `✅ ${toolResult.result.message}! Your cart now contains ${toolResult.result.items.length} item(s). Would you like to continue shopping or proceed to checkout?`;
        break;

      case "remove_from_cart":
        enhancedResponse = `🗑️ ${toolResult.result.message}. Is there anything else you'd like to remove or add to your cart?`;
        break;

      case "begin_checkout":
        enhancedResponse = `🛒 Perfect! I've prepared your checkout. You can complete your purchase here: ${toolResult.result.checkout_url}\n\nClick the link above to review your items and complete your order securely.`;
        break;

      case "order_status":
        if (toolResult.result.found && toolResult.result.order) {
          const order = toolResult.result.order;
          enhancedResponse = `📦 Here's your order status:\n\n`;
          enhancedResponse += `**Order:** ${order.name}\n`;
          enhancedResponse += `**Status:** ${order.fulfillmentStatus || 'Processing'}\n`;
          enhancedResponse += `**Total:** ${order.totalPrice}\n`;
          enhancedResponse += `**Date:** ${new Date(order.processedAt).toLocaleDateString()}\n`;
          
          if (order.trackingInfo && order.trackingInfo.length > 0) {
            enhancedResponse += `**Tracking:** ${order.trackingInfo[0].number}\n`;
          }
          
          enhancedResponse += `\nIs there anything else you'd like to know about your order?`;
        } else {
          enhancedResponse = `❌ I couldn't find an order with ID "${toolResult.result.order_id}". Please check the order number and try again.`;
        }
        break;
    }
  }

  return enhancedResponse;
}
