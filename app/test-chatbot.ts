// Simple test script to verify chatbot functionality
// Run with: npx tsx app/test-chatbot.ts

import { googleAIService } from "./services/google-ai";

async function testChatbot() {
  console.log("🤖 Testing ShopBot AI Assistant...\n");

  const sessionId = "test_session_123";
  
  const testMessages = [
    "Hello!",
    "I'm looking for running shoes",
    "Show me products under $50",
    "Add the first item to my cart",
    "What's in my cart?",
    "Help me checkout"
  ];

  for (const message of testMessages) {
    console.log(`👤 User: ${message}`);
    
    try {
      // Note: This will use mock data since we don't have a real request object
      const response = await googleAIService.processMessage(sessionId, message);
      
      console.log(`🤖 Assistant: ${response.response}`);
      console.log(`📊 Intent: ${response.intent}`);
      
      if (response.toolCalls.length > 0) {
        console.log(`🔧 Tool Calls: ${response.toolCalls.map(tc => tc.tool).join(", ")}`);
      }
      
      console.log("---\n");
      
      // Small delay to simulate real conversation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log("---\n");
    }
  }

  console.log("✅ Test completed!");
}

// Only run if this file is executed directly
if (require.main === module) {
  // Don't set API key to test fallback behavior
  delete process.env.GOOGLE_AI_API_KEY;

  testChatbot().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
  });
}
