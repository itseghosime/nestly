/**
 * Social-only messages are handled separately from grounded property requests.
 * Anchored patterns intentionally leave mixed greetings/searches/fees to the search engine.
 */
export function getNiaSocialReply(query: string, hasPreferences: boolean): string | null {
  const text = query.toLowerCase().replace(/[’‘]/g, "'")
    .replace(/[!?.,…👋😊🙂🙏]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (/^\/(?:start|help)(?:@[a-z0-9_]+)?$/.test(text)) {
    return "Hi! 👋 I'm Nia, Nestly's virtual property assistant. I can help you find a home, check listed fees, or connect you with the team. Which area are you interested in?";
  }
  if (/^(?:(?:hey+|hi+|hello+|hiya|howdy|good (?:morning|afternoon|evening)))(?: (?:nia|there|nia there))?$/.test(text)) {
    const opening = /^(?:hey|hi|hiya)/.test(text) ? 'Hey! 👋' : 'Hello! 👋';
    return hasPreferences
      ? opening + " Welcome back. Would you like to keep looking with your saved preferences, or try something new?"
      : opening + " I'm Nia. Let's find a place that feels right for you. Which area are you looking in?";
  }
  if (/^(?:(?:hey|hi|hello)(?: nia)? )?(?:how are you(?: doing)?|how's it going|what's up|whats up|how far|how you dey|how are you dey)(?: nia)?$/.test(text)) {
    return "Hey! I'm here and ready to help 😊 How's your home search going?";
  }
  if (/^(?:who are you|what(?:'s| is) your name|are you (?:a bot|human|real)|what can you do)(?: nia)?$/.test(text)) {
    return "I'm Nia, Nestly's virtual property assistant. I can help you explore homes, remember your search preferences, check listed fees, and ask the team to take over when you need a person. What can I help you with?";
  }
  if (/^(?:thank you(?: so much)?|thanks(?: a lot| so much)?|thank you nia|thanks nia|cheers|appreciate it|you(?:'re| are) (?:great|helpful|the best))$/.test(text)) {
    return hasPreferences
      ? "You're welcome! 😊 Would you like to explore another option or check the fees for one you liked?"
      : "You're welcome! 😊 Whenever you're ready, tell me where you'd like to find a home.";
  }
  if (/^(?:bye|goodbye|good ?night|see you(?: later)?|talk later|catch you later)(?: nia)?$/.test(text)) {
    return "Take care! 👋 Come back whenever you're ready to continue your home search.";
  }
  if (/^(?:ok(?:ay)?|alright|all right|cool|nice|great|awesome|perfect|yes|yeah|yep|sure|no|nope)$/.test(text)) {
    return hasPreferences
      ? "What would you like to do next—see more homes, change your search, or check a listing's fees?"
      : "Tell me the area you're interested in, and we'll take it from there.";
  }
  if (/^(?:i(?:'m| am) (?:confused|frustrated|tired)|(?:this|you) (?:is|are) (?:confusing|not helping)|you don'?t understand(?: me)?|that(?:'s| is) not what i (?:asked|meant)|i don'?t understand)$/.test(text)) {
    return "Sorry, I missed what you needed. Let's take it one step at a time. What would you like help with? You can also ask me to connect you with the team.";
  }
  return null;
}
