import { RedditPost } from '@prisma/client';
import { Button } from './ui/button';
import { formatDistanceToNow } from 'date-fns';
import { Star, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from './ui/checkbox';
import { useToast } from './ui/use-toast';

interface PostCardProps {
  post: RedditPost;
  onGenerateReply: () => void;
}

export function PostCard({ post, onGenerateReply }: PostCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReplied, setIsReplied] = useState(post.isReplied);
  const { toast } = useToast();

  const handleGenerateReply = async () => {
    try {
      setIsGenerating(true);
      const response = await fetch(`/api/posts/${post.id}/reply`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate reply');

      const updatedPost = await response.json();
      // Update the post in the UI with the new reply
      onGenerateReply();
      
      toast({
        title: "Reply Generated",
        description: "Your reply has been generated successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate reply. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReply = async () => {
    if (post.latestReply) {
      await navigator.clipboard.writeText(post.latestReply);
      toast({
        title: "Copied!",
        description: "Reply copied to clipboard",
      });
    }
  };

  const handleReplyStatusChange = async (checked: boolean) => {
    try {
      const response = await fetch(`/api/posts/${post.id}/reply`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isReplied: checked }),
      });

      if (!response.ok) throw new Error('Failed to update reply status');

      setIsReplied(checked);
      toast({
        title: checked ? "Marked as Replied" : "Marked as Not Replied",
        description: checked ? "Post has been marked as replied" : "Post has been marked as not replied",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reply status",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-gray-900/90 border border-gray-800/50 rounded-xl p-6 hover:border-gray-700/50 transition-all w-full mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-medium text-lg text-white/90">
            {post.title}
          </h3>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
            <span>r/{post.subreddit}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
          </div>
        </div>
        <button className="text-gray-400 hover:text-yellow-400 transition-colors">
          <Star className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="mt-4">
        <p className="text-gray-300 whitespace-pre-wrap">
          {post.text}
        </p>
      </div>

      {/* Generated Reply section */}
      {post.latestReply && (
        <div className="mt-6 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-gradient rounded-lg" />
          <div className="relative bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg border border-gray-800/50">
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-sm font-medium text-gray-400">Generated Reply</h4>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyReply}
                  className="text-gray-400 hover:text-gray-300"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`replied-${post.id}`}
                    checked={isReplied}
                    onCheckedChange={handleReplyStatusChange}
                  />
                  <label
                    htmlFor={`replied-${post.id}`}
                    className="text-sm text-gray-400"
                  >
                    Mark as Replied
                  </label>
                </div>
              </div>
            </div>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">
              {post.latestReply}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <Button 
          onClick={handleGenerateReply}
          disabled={isGenerating}
          className="flex-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
        >
          {isGenerating ? 'Generating...' : 'Generate Reply'}
        </Button>
        <Button 
          variant="outline"
          onClick={() => window.open(post.url, '_blank')}
          className="px-3"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}