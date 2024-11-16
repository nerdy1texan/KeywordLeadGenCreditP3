"use client";

import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useChat } from 'ai/react';
import { X, Save, Copy, Send, Edit, Check } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RedditPost, Product } from '@/types/product';

interface CommentBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  post: RedditPost & { 
    product?: Product;
  };
}

export function CommentBuilder({ isOpen, onClose, post }: CommentBuilderProps) {
  const [currentReply, setCurrentReply] = useState(post?.latestReply || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();

  const productData = {
    name: post?.product?.name || 'Product',
    description: post?.product?.description || '',
    keywords: post?.product?.keywords || [],
    url: post?.product?.url || ''
  };

  // Separate save and close functions
  const saveReply = async () => {
    try {
      if (currentReply) {
        const response = await fetch(`/api/posts/${post.id}/comment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ comment: currentReply }),
        });

        if (!response.ok) throw new Error('Failed to save reply');

        toast({
          title: "Success",
          description: "Reply saved successfully",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error saving reply:', error);
      toast({
        title: "Error",
        description: "Failed to save reply",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  // Handle different close scenarios
  const handleCancel = () => {
    onClose();
  };

  const handleSaveAndClose = async () => {
    await saveReply();
    onClose();
  };

  // Add this function before the useChat setup
  const handleImprove = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsImproving(true);
    await handleSubmit(e);
  };

  // Chat completion setup for improvements
  const { messages, handleSubmit, input, handleInputChange } = useChat({
    api: '/api/chat',
    initialMessages: [
      {
        id: 'system',
        role: 'system',
        content: `You are an expert at improving Reddit replies while maintaining subtle product promotion.
        
        Product Context:
        Name: ${productData.name}
        Description: ${productData.description}
        Keywords: ${productData.keywords.join(', ')}
        URL: ${productData.url}
        
        Post Context:
        Subreddit: ${post?.subreddit || ''}
        Title: ${post?.title || ''}
        Content: ${post?.text || ''}
        
        Current Reply: ${currentReply}
        
        Guidelines:
        1. Keep the product mention natural and relevant
        2. Maintain authenticity and helpfulness
        3. Ensure the reply adds value first
        4. Keep the product promotion subtle
        5. Include the product URL ONLY ONCE using round parentheses
        6. NEVER repeat URLs or product mentions
        7. Format URLs as: "Check it out (URL)" or similar
        8. Remove any duplicate URLs from the response
        9. Make the reply feel naturally hand-typed:
           - Add occasional typos (but not too many)
           - Use casual language and contractions
           - Include filler words like "tbh", "imo", "..."
           - Vary sentence structure
           - Add personal touches or anecdotes
        10. If multiple URLs exist, keep only the last one`
      }
    ],
    onFinish: async (message) => {
      setIsImproving(false);
      const cleanedContent = message.content.replace(/(?:https?:\/\/[^\s]+)(?:.*)(https?:\/\/[^\s]+)/g, '$1');
      setCurrentReply(cleanedContent);
      await handleSaveAndClose();
    },
  });

  // Improvement prompts
  const improvementPrompts = {
    'Make it more personal': 'Make the reply more personal and relatable while maintaining the product mention.',
    'Make it more professional': 'Make the reply more professional and authoritative while keeping the product recommendation credible.',
    'Make it shorter': 'Make the reply more concise while preserving both the helpful advice and product mention.',
    'Make it longer': 'Expand the reply with more details and examples, strengthening both the advice and product relevance.',
    'Add more examples': 'Add relevant examples that reinforce both the advice and product value.',
    'Make it more empathetic': 'Enhance the empathy and understanding while maintaining the natural product recommendation.'
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-[800px] bg-gray-950/90 backdrop-blur-xl border border-gray-800/50 shadow-2xl transform-gpu">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-50 rounded-lg animate-gradient-slow" />
        
        <DialogHeader className="relative z-10">
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              AI Reply Assistant
            </DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="p-6 flex flex-col gap-6 relative z-10">
          {/* Current Reply Section */}
          <div className="relative transform-gpu transition-all duration-300 hover:scale-[1.01]">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-xl blur-sm" />
            <div className="relative bg-gray-900/80 p-5 rounded-xl border border-gray-800/50 backdrop-blur-xl">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-medium text-gray-400">Current Reply</h4>
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(currentReply);
                          toast({
                            title: "Copied",
                            description: "Reply copied to clipboard",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <Textarea
                  value={currentReply}
                  onChange={(e) => setCurrentReply(e.target.value)}
                  className="min-h-[150px] w-full bg-gray-900 whitespace-pre-wrap"
                  style={{ whiteSpace: 'pre-wrap' }}
                />
              ) : (
                <div className="min-h-[150px] w-full bg-gray-900 rounded-md p-4 whitespace-pre-wrap">
                  {currentReply}
                </div>
              )}
            </div>
          </div>

          {/* Improvement Options */}
          {!isEditing && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(improvementPrompts).map(([label, prompt]) => (
                  <Button
                    key={label}
                    variant="outline"
                    disabled={isImproving}
                    onClick={() => handleInputChange({ target: { value: prompt } } as any)}
                    className="relative group overflow-hidden bg-gray-900/50 border border-gray-800/50 hover:border-transparent transition-all duration-300"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                    <span className="relative z-10 font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent group-hover:text-white transition-all duration-300">
                      {label}
                    </span>
                  </Button>
                ))}
              </div>

              {/* Custom Improvement Input */}
              <form onSubmit={handleImprove} className="flex gap-3">
                <Textarea
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Type custom instructions for improving the reply..."
                  className="flex-1 bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm transition-all duration-300 focus:border-purple-500/50 focus:ring-purple-500/20"
                  disabled={isImproving}
                />
                <Button 
                  type="submit"
                  disabled={isImproving}
                  className="self-end bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transform-gpu transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
                >
                  {isImproving ? 'Improving...' : 'Improve'}
                </Button>
              </form>
            </>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 mt-2">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              className="border border-gray-800/50 hover:bg-gray-800/30 transition-all duration-300"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSaveAndClose}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transform-gpu transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
            >
              <Save className="h-4 w-4 mr-2" />
              Save & Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
