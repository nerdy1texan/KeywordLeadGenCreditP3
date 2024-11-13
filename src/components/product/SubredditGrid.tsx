import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type SubredditSuggestion } from "@/types/product";

interface SubredditGridProps {
  subreddits: SubredditSuggestion[];
  isLoading?: boolean;
}

export function SubredditGrid({ subreddits, isLoading }: SubredditGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Finding Relevant Subreddits...</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-start">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sort subreddits by relevance score
  const sortedSubreddits = [...subreddits].sort((a, b) => b.relevanceScore - a.relevanceScore);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">
        {sortedSubreddits.length > 0 
          ? `Relevant Subreddits (${sortedSubreddits.length})`
          : "No relevant subreddits found yet"}
      </h3>
      <div className="max-h-[800px] overflow-y-auto pr-2">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedSubreddits.map((subreddit) => (
            <div key={subreddit.id || subreddit.name} className="border border-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <a 
                  href={subreddit.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-400 font-medium"
                >
                  r/{subreddit.name}
                </a>
                <Badge variant="secondary">
                  {(subreddit.memberCount || 0).toLocaleString()} members
                </Badge>
              </div>
              <p className="text-sm text-gray-400 line-clamp-2">
                {subreddit.description || 'No description available'}
              </p>
              <div className="mt-2 flex gap-2">
                <Badge variant={subreddit.relevanceScore >= 80 ? "success" : "outline"} className="mt-2">
                  Relevance: {Math.round(subreddit.relevanceScore)}%
                </Badge>
                {subreddit.isMonitored && (
                  <Badge variant="success" className="mt-2">
                    Monitored
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
