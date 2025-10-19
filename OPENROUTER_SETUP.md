# OpenRouter API Setup Guide

## 🚀 Free Alternative to OpenAI & Anthropic APIs

OpenRouter provides access to multiple LLM models through a single API key, including **free tier options** that make it perfect for development and testing without requiring paid OpenAI or Anthropic accounts.

## 📋 What OpenRouter Offers

### **Free Models Available:**
- **Meta Llama 3.1** (8B & 70B) - High quality open source models
- **Mistral 7B** - Excellent for development testing
- **Many other open source models**

### **Premium Models (Paid):**
- **GPT-4 Turbo** (via OpenRouter)
- **Claude 3.5 Sonnet** (via OpenRouter)
- **All latest models from major providers**

## 🔧 Setup Instructions

### 1. Create OpenRouter Account

1. **Sign Up**: Visit [OpenRouter.ai](https://openrouter.ai)
2. **Register**: Create a free account (no credit card required for free tier)
3. **Get API Key**: Navigate to API Keys section

### 2. Update Environment Configuration

Edit your `.env` file:

```bash
# Add your OpenRouter API key
OPENROUTER_API_KEY=sk-or-your-actual-openrouter-api-key-here

# Optional: Keep OpenAI/Anthropic keys if you have them
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### 3. Free vs Paid Models

The Cognitive Fabric Visualizer will automatically:

1. **Try OpenRouter first** (if API key provided)
2. **Fallback to OpenAI/Anthropic** (if keys available)
3. **Use local models** (if configured)

### 4. Recommended Free Models for Development

```python
# These work great with OpenRouter free tier:
"meta-llama/llama-3.1-8b-instruct"    # Fast, free, good quality
"meta-llama/llama-3.1-70b-instruct"   # Higher quality, slower
"mistralai/mistral-7b-instruct"        # Fast, lightweight
```

## 💰 Cost Comparison

| Provider | Model | Cost (per 1M tokens) | Free Tier |
|----------|-------|---------------------|----------|
| **OpenAI** | GPT-4 | ~$30 | ❌ No |
| **Anthropic** | Claude 3.5 | ~$15 | ❌ No |
| **OpenRouter** | Llama 3.1 8B | **$0** | ✅ Yes |
| **OpenRouter** | Llama 3.1 70B | ~$0.50 | ✅ Yes |

## 🎯 Quick Start

1. **Get OpenRouter API Key**: [openrouter.ai](https://openrouter.ai)
2. **Update .env**: Add `OPENROUTER_API_KEY=your-key`
3. **Start Application**: `npm run dev`

The application will automatically prioritize OpenRouter for cost-effective processing while maintaining the option to use premium models when needed.

## 🔒 Security Note

- OpenRouter API keys work the same as OpenAI/Anthropic keys
- No additional security configuration needed
- Same encryption and security standards apply

## 📚 More Information

- **OpenRouter Documentation**: [docs.openrouter.ai](https://docs.openrouter.ai)
- **Available Models**: [openrouter.ai/models](https://openrouter.ai/models)
- **Pricing**: [openrouter.ai/pricing](https://openrouter.ai/pricing)

---

**💡 Pro Tip**: Start with OpenRouter free models for development, then upgrade to premium models for production when needed. The Cognitive Fabric Visualizer will automatically handle the model selection and fallback logic for you!