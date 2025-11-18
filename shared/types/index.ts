// Общие типы для всего проекта

export type GenerationType =
  | 'worksheet'
  | 'quiz'
  | 'vocabulary'
  | 'lesson-plan'
  | 'content-adaptation'
  | 'message'
  | 'feedback'
  | 'image'
  | 'photosession'
  | 'presentation'
  | 'transcription';

export type OperationType =
  | 'text_generation'
  | 'image_generation'
  | 'photosession'
  | 'presentation'
  | 'transcription'
  | 'worksheet'
  | 'quiz'
  | 'vocabulary'
  | 'lesson_plan'
  | 'feedback'
  | 'content_adaptation'
  | 'message';

export type SubscriptionPlanKey = 'starter' | 'pro' | 'business';

export type GenerationStatus = 'pending' | 'completed' | 'failed';

export interface GenerationRequest {
  userId: string;
  generationType: GenerationType;
  inputParams: Record<string, any>;
  model?: string;
}

export interface GenerationResult {
  id: string;
  userId: string;
  type: GenerationType;
  status: GenerationStatus;
  params: Record<string, any>;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  model?: string;
}

