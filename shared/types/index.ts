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
  | 'transcription'
  | 'gigachat-chat'
  | 'gigachat-image'
  | 'gigachat-embeddings'
  | 'gigachat-audio-speech'
  | 'gigachat-audio-transcription'
  | 'gigachat-audio-translation';

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
  | 'message'
  | 'gigachat_text'
  | 'gigachat_image'
  | 'gigachat_audio'
  | 'gigachat_embeddings';

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

