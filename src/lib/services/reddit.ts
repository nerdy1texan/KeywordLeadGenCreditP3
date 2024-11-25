import { prisma } from "@/lib/db";
import { ApifyClient } from 'apify-client';
import { SubredditSuggestion } from "@/types/product";
import { ApifySubredditResponse, isApifySubredditResponse } from "@/types/apify";

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function getSubredditsFromApify(keywords: string[]): Promise<ApifySubredditResponse[]> {
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
    });

    const { items = [] } = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    const arrayItems = (Array.isArray(items) ? items : []) as unknown[];
    
    const validItems = arrayItems
      .filter(isApifySubredditResponse)
      .filter((item: ApifySubredditResponse) => 
        item.numberOfMembers >= 1000 &&
        item.title &&
        item.url
      );
    
    return validItems;
  } catch (error) {
    console.error("Error fetching from Apify:", error);
    return [];
  }
}

function calculateRelevanceScore(item: ApifySubredditResponse, keywords: string[]): number {
  let score = 65;
  
  const content = `${item.title} ${item.description || ''}`.toLowerCase();
  
  keywords.forEach(keyword => {
    const keywordParts = keyword.toLowerCase().split(' ');
    if (keywordParts.some(part => content.includes(part))) {
      score += 15;
    }
    if (content.includes(keyword.toLowerCase())) {
      score += 5;
    }
  });
  
  const members = item.numberOfMembers;
  if (members > 100000) score += 25;
  else if (members > 10000) score += 15;
  else if (members > 1000) score += 10;
  
  if (content.includes('discuss') || 
      content.includes('help') || 
      content.includes('question') ||
      content.includes('advice')) {
    score += 10;
  }
  
  if (keywords.some(keyword => 
    keyword.toLowerCase().split(' ').some(part => 
      content.includes(part)
    ))) {
    score = Math.max(score, 70);
  }
  
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
      return cachedResults.map(result => ({
        ...result,
        matchReason: result.matchReason || undefined
      }));
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { keywords: true }
    });

    if (!product?.keywords?.length) {
      return [];
    }

    const results = await getSubredditsFromApify(product.keywords);
    
    const subreddits = results
      .map(item => ({
        name: item.displayName || item.title.replace(/^r\//, ''),
        title: item.title,
        description: item.description || '',
        memberCount: item.numberOfMembers,
        url: item.url,
        relevanceScore: calculateRelevanceScore(item, product.keywords),
        matchReason: `Matched keywords: ${product.keywords.join(', ')}`,
        isMonitored: false,
        productId
      }))
      .filter(sub => sub.relevanceScore >= 60)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    if (subreddits.length > 0) {
      await prisma.subredditSuggestion.createMany({
        data: subreddits.map(sub => ({
          name: sub.name,
          title: sub.title,
          description: sub.description,
          memberCount: sub.memberCount,
          url: sub.url,
          relevanceScore: sub.relevanceScore,
          matchReason: sub.matchReason,
          isMonitored: sub.isMonitored,
          productId: sub.productId,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      });
    }

    return subreddits;
  } catch (error) {
    console.error("Error in findRelevantSubreddits:", error);
    return [];
  }
}