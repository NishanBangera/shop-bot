import { authenticate } from "../shopify.server";

// Types for Shopify API responses
export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  images: Array<{
    id: string;
    url: string;
    altText?: string;
  }>;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    compareAtPrice?: string;
    available: boolean;
    selectedOptions: Array<{
      name: string;
      value: string;
    }>;
  }>;
  tags: string[];
  productType: string;
  vendor: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  orderNumber: number;
  processedAt: string;
  totalPrice: string;
  subtotalPrice: string;
  totalTax: string;
  fulfillmentStatus?: string;
  financialStatus: string;
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    price: string;
    variant?: {
      id: string;
      title: string;
    };
  }>;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  trackingInfo?: Array<{
    number: string;
    url: string;
    company: string;
  }>;
}

export class ShopifyAPIService {
  // Search products using Shopify Admin API
  static async searchProducts(
    request: Request,
    query: string,
    limit: number = 10,
    collectionId?: string
  ): Promise<ShopifyProduct[]> {
    const { admin } = await authenticate.admin(request);

    try {
      // Build GraphQL query
      let graphqlQuery = `
        query searchProducts($query: String!, $first: Int!) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                description
                handle
                images(first: 5) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      price
                      compareAtPrice
                      availableForSale
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
                tags
                productType
                vendor
                createdAt
                updatedAt
              }
            }
          }
        }
      `;

      const variables = {
        query: query,
        first: limit,
      };

      const response = await admin.graphql(graphqlQuery, { variables });
      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      // Transform the response to our format
      const products: ShopifyProduct[] = data.data.products.edges.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        description: edge.node.description || "",
        handle: edge.node.handle,
        images: edge.node.images.edges.map((imgEdge: any) => ({
          id: imgEdge.node.id,
          url: imgEdge.node.url,
          altText: imgEdge.node.altText,
        })),
        variants: edge.node.variants.edges.map((varEdge: any) => ({
          id: varEdge.node.id,
          title: varEdge.node.title,
          price: varEdge.node.price,
          compareAtPrice: varEdge.node.compareAtPrice,
          available: varEdge.node.availableForSale,
          selectedOptions: varEdge.node.selectedOptions,
        })),
        tags: edge.node.tags,
        productType: edge.node.productType,
        vendor: edge.node.vendor,
        createdAt: edge.node.createdAt,
        updatedAt: edge.node.updatedAt,
      }));

      return products;
    } catch (error) {
      console.error("Error searching products:", error);
      throw new Error(`Failed to search products: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get product by ID
  static async getProduct(request: Request, productId: string): Promise<ShopifyProduct | null> {
    const { admin } = await authenticate.admin(request);

    try {
      const graphqlQuery = `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            description
            handle
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                  availableForSale
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
            tags
            productType
            vendor
            createdAt
            updatedAt
          }
        }
      `;

      const response = await admin.graphql(graphqlQuery, {
        variables: { id: productId },
      });
      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      if (!data.data.product) {
        return null;
      }

      const product = data.data.product;
      return {
        id: product.id,
        title: product.title,
        description: product.description || "",
        handle: product.handle,
        images: product.images.edges.map((edge: any) => ({
          id: edge.node.id,
          url: edge.node.url,
          altText: edge.node.altText,
        })),
        variants: product.variants.edges.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          price: edge.node.price,
          compareAtPrice: edge.node.compareAtPrice,
          available: edge.node.availableForSale,
          selectedOptions: edge.node.selectedOptions,
        })),
        tags: product.tags,
        productType: product.productType,
        vendor: product.vendor,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    } catch (error) {
      console.error("Error getting product:", error);
      throw new Error(`Failed to get product: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get order by ID
  static async getOrder(request: Request, orderId: string): Promise<ShopifyOrder | null> {
    const { admin } = await authenticate.admin(request);

    try {
      const graphqlQuery = `
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            name
            orderNumber
            processedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            subtotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalTaxSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            fulfillmentStatus
            displayFinancialStatus
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    title
                  }
                }
              }
            }
            shippingAddress {
              firstName
              lastName
              address1
              city
              province
              country
              zip
            }
            fulfillments {
              trackingInfo {
                number
                url
                company
              }
            }
          }
        }
      `;

      const response = await admin.graphql(graphqlQuery, {
        variables: { id: orderId },
      });
      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      if (!data.data.order) {
        return null;
      }

      const order = data.data.order;
      return {
        id: order.id,
        name: order.name,
        orderNumber: order.orderNumber,
        processedAt: order.processedAt,
        totalPrice: `${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`,
        subtotalPrice: `${order.subtotalPriceSet.shopMoney.amount} ${order.subtotalPriceSet.shopMoney.currencyCode}`,
        totalTax: `${order.totalTaxSet.shopMoney.amount} ${order.totalTaxSet.shopMoney.currencyCode}`,
        fulfillmentStatus: order.fulfillmentStatus,
        financialStatus: order.displayFinancialStatus,
        lineItems: order.lineItems.edges.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          quantity: edge.node.quantity,
          price: `${edge.node.originalUnitPriceSet.shopMoney.amount} ${edge.node.originalUnitPriceSet.shopMoney.currencyCode}`,
          variant: edge.node.variant ? {
            id: edge.node.variant.id,
            title: edge.node.variant.title,
          } : undefined,
        })),
        shippingAddress: order.shippingAddress,
        trackingInfo: order.fulfillments.flatMap((fulfillment: any) => 
          fulfillment.trackingInfo.map((info: any) => ({
            number: info.number,
            url: info.url,
            company: info.company,
          }))
        ),
      };
    } catch (error) {
      console.error("Error getting order:", error);
      throw new Error(`Failed to get order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Create a checkout URL (simplified version)
  static async createCheckout(request: Request, lineItems: Array<{ variantId: string; quantity: number }>): Promise<string> {
    const { admin } = await authenticate.admin(request);

    try {
      // In a real implementation, you would create a proper checkout
      // For now, we'll create a simple cart URL
      const variantParams = lineItems.map(item => `${item.variantId}:${item.quantity}`).join(',');
      
      // Get shop domain
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
      
      // Create checkout URL (this is a simplified approach)
      const checkoutUrl = `https://${shopDomain}/cart/${variantParams}`;
      
      return checkoutUrl;
    } catch (error) {
      console.error("Error creating checkout:", error);
      throw new Error(`Failed to create checkout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get collections
  static async getCollections(request: Request, limit: number = 10): Promise<Array<{ id: string; title: string; handle: string }>> {
    const { admin } = await authenticate.admin(request);

    try {
      const graphqlQuery = `
        query getCollections($first: Int!) {
          collections(first: $first) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `;

      const response = await admin.graphql(graphqlQuery, {
        variables: { first: limit },
      });
      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data.collections.edges.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
      }));
    } catch (error) {
      console.error("Error getting collections:", error);
      throw new Error(`Failed to get collections: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
