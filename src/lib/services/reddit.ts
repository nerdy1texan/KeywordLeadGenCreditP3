import { prisma } from "@/lib/db";
import { ApifyClient } from 'apify-client';
import { SubredditSuggestion } from "@/types/product";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function getSubredditsFromApify(keywords: string[]) {
  try {
    const run = await apifyClient.actor("trudax/reddit-scraper-lite").call({
      searches: keywords.map(k => `${k} reddit`),
      type: "community",
      sort: "relevance",
      maxItems: 10,
      maxCommunitiesCount: 10,
      proxy: {
        useApifyProxy: true
      },
      searchCommunities: true,
      searchPosts: false,
      searchComments: false,
      searchUsers: false,
      includeNSFW: false,
      time: "all"
    });

    const { items = [] } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    console.log("Raw Apify results:", items);
    
    return items.filter(item => 
      item.dataType === "community" &&
      item.numberOfMembers >= 1000 &&
      !item.over18 &&
      item.description
    );
  } catch (error) {
    console.error("Error fetching from Apify:", error);
    return [];
  }
}

function calculateRelevanceScore(item: any, keywords: string[]): number {
  let score = 50;
  
  const content = `${item.title} ${item.description}`.toLowerCase();
  
  keywords.forEach(keyword => {
    if (content.includes(keyword.toLowerCase())) score += 10;
  });
  
  const members = item.numberOfMembers || 0;
  if (members > 100000) score += 20;
  else if (members > 10000) score += 10;
  else if (members > 1000) score += 5;
  
  return Math.min(100, score);
}

export async function findRelevantSubreddits(
  productId: string
): Promise<SubredditSuggestion[]> {
  try {
    const cachedResults = await prisma.subredditSuggestion.findMany({
      where: { 
        productId,
        relevanceScore: { gte: 60 }
      },
      orderBy: { relevanceScore: 'desc' },
      take: 5
    });

    if (cachedResults.length >= 5) {
      return cachedResults;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { keywords: true }
    });

    if (!product?.keywords?.length) {
      return [];
    }

    const results = await getSubredditsFromApify(product.keywords);
    
    const subreddits = results.map(item => ({
      name: item.displayName || item.title.replace(/^r\//, ''),
      title: item.title,
      description: item.description,
      memberCount: item.numberOfMembers,
      url: `https://reddit.com/r/${item.displayName || item.title.replace(/^r\//, '')}`,
      relevanceScore: calculateRelevanceScore(item, product.keywords),
      matchReason: `Relevant to: ${product.keywords.slice(0, 3).join(", ")}`,
      isMonitored: false,
      productId
    }))
    .filter(sub => sub.relevanceScore >= 60)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

    if (subreddits.length > 0) {
      await prisma.subredditSuggestion.createMany({
        data: subreddits,
        skipDuplicates: true
      });
    }

    return subreddits;
  } catch (error) {
    console.error("Error in findRelevantSubreddits:", error);
    return [];
  }
}