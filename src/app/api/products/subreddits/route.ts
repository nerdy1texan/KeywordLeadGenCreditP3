import { withMiddleware } from "@/lib/apiHelper";
import { prisma } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";
import { ApifyClient } from 'apify-client';
import { OpenAI } from 'openai';

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const GET = withMiddleware(async (req: NextRequest) => {
  try {
    const description = req.nextUrl.searchParams.get("description");
    const productId = req.nextUrl.searchParams.get("productId");
    
    if (!description || !productId) {
      return new NextResponse("Description and Product ID are required", { status: 400 });
    }

    // First get existing subreddits
    const existingSubreddits = await prisma.subredditSuggestion.findMany({
      where: { productId },
      orderBy: { relevanceScore: 'desc' }
    });

    const existingNames = new Set(existingSubreddits.map(sub => sub.name.toLowerCase()));

    // Extract keywords and find new subreddits
    const keywords = await extractKeywords(description);
    console.log('Searching with keywords:', keywords);

    const run = await apifyClient.actor("trudax/reddit-scraper-lite").call({
      searches: keywords,
      type: "community",
      sort: "relevance",
      maxItems: 200,
      maxCommunitiesCount: 100,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"]
      },
      searchCommunities: true,
      searchPosts: false,
      time: "all"
    });

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    // Process and filter new subreddits
    const newSubredditsData = items
      .filter(item => 
        item.dataType === "community" &&
        item.numberOfMembers >= 1000 && // Lowered threshold
        !item.over18 &&
        item.displayName // Ensure displayName exists
      )
      .map(item => {
        // Clean the subreddit name (remove 'r/' prefix if present)
        const name = (item.displayName || item.title || '')
          .replace(/^r\//i, '')
          .toLowerCase();

        // Skip if already exists
        if (existingNames.has(name)) {
          console.log(`Skipping existing subreddit: ${name}`);
          return null;
        }

        const relevanceScore = calculateRelevanceScore(item, keywords);
        
        // Only include if relevance score is high enough
        if (relevanceScore < 75) {
          console.log(`Skipping low relevance subreddit: ${name} (${relevanceScore}%)`);
          return null;
        }

        return {
          name,
          title: item.title || name,
          description: item.description || "No description available",
          memberCount: parseInt(item.numberOfMembers) || 0,
          url: `https://reddit.com/r/${name}`,
          relevanceScore,
          matchReason: `Relevant to: ${keywords.slice(0, 3).join(", ")}`,
          isMonitored: false,
          productId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      })
      .filter(Boolean) // Remove null entries
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    console.log(`Found ${newSubredditsData.length} new relevant subreddits`);

    // Store new subreddits in database
    if (newSubredditsData.length > 0) {
      try {
        await prisma.$transaction(
          newSubredditsData.map(subreddit => 
            prisma.subredditSuggestion.upsert({
              where: {
                productId_name: {
                  productId: productId,
                  name: subreddit.name
                }
              },
              update: {
                relevanceScore: subreddit.relevanceScore,
                matchReason: subreddit.matchReason,
                description: subreddit.description,
                memberCount: subreddit.memberCount,
                updatedAt: new Date()
              },
              create: subreddit
            })
          )
        );
        console.log(`Successfully processed ${newSubredditsData.length} subreddits`);
      } catch (error) {
        console.error('Error processing subreddits:', error);
      }
    }

    // Return updated list
    const allSubreddits = await prisma.subredditSuggestion.findMany({
      where: { productId },
      orderBy: { relevanceScore: 'desc' }
    });

    return NextResponse.json(allSubreddits);
  } catch (error: any) {
    console.error("API Error:", error);
    return new NextResponse(
      JSON.stringify({ error: error.message || "Failed to fetch subreddits" }), 
      { status: 500 }
    );
  }
});

// Helper function to extract keywords using OpenAI
async function extractKeywords(description: string): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: "Extract 3-5 most relevant search keywords for finding Reddit communities related to this product/service. Return only the keywords separated by commas, no explanation."
      },
      {
        role: "user",
        content: description
      }
    ],
    temperature: 0.3,
  });

  const keywords = completion.choices[0]?.message?.content?.split(',')
    .map(k => k.trim())
    .filter(Boolean) || [];
    
  return keywords;
}

// Helper function to calculate relevance score
function calculateRelevanceScore(subreddit: any, keywords: string[]): number {
  let score = 70; // Base score
  let relevanceHits = 0;
  const totalKeywords = keywords.length;
  
  // Check title and description for keyword matches
  keywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();
    const titleLower = subreddit.title?.toLowerCase() || '';
    const descLower = subreddit.description?.toLowerCase() || '';
    
    // Direct matches in title are very important
    if (titleLower.includes(keywordLower)) {
      score += 15;
      relevanceHits++;
    }
    
    // Matches in description are good too
    if (descLower.includes(keywordLower)) {
      score += 10;
      relevanceHits++;
    }
  });

  // Calculate keyword match percentage
  const matchPercentage = (relevanceHits / totalKeywords) * 100;
  
  // Bonus for high member count (we want active communities)
  if (subreddit.numberOfMembers > 1000000) score += 10;
  else if (subreddit.numberOfMembers > 100000) score += 5;
  
  // Penalty for very small communities
  if (subreddit.numberOfMembers < 10000) score -= 20;
  
  // If less than 30% of keywords match, significantly reduce score
  if (matchPercentage < 30) score -= 30;
  
  // Cap the score
  return Math.min(100, Math.max(0, score));
}

// Helper function to search for subreddits using Apify
async function getSubredditsFromApify(keywords: string[]) {
  try {
    const run = await apifyClient.actor("trudax/reddit-scraper-lite").call({
      searches: keywords,
      type: "community", // Specifically search for communities
      sort: "relevance", // Sort by relevance to get most relevant communities
      maxItems: 100, // Get more items to filter down to best matches
      maxCommunitiesCount: 20, // Limit to 20 most relevant communities
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"]
      },
      searchCommunities: true,
      searchPosts: false, // Disable post search
      time: "all"
    });

    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

    // Filter and format subreddits
    const subreddits = items
      .filter((item: any) => 
        item.dataType === 'community' && 
        item.numberOfMembers > 10000 // Only communities with significant membership
      )
      .map((item: any) => ({
        name: item.title,
        title: item.title,
        description: item.description || '',
        memberCount: item.numberOfMembers,
        url: item.url,
        relevanceScore: calculateRelevanceScore(item, keywords),
        matchReason: `Relevant to: ${keywords.slice(0, 3).join(", ")}`,
        isMonitored: false,
        productId
      }))
      .filter(sub => sub.relevanceScore >= 75) // Only keep highly relevant ones
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 20); // Keep top 20 most relevant

    return subreddits;
  } catch (error) {
    console.error("Error in findRelevantSubreddits:", error);
    return [];
  }
} 