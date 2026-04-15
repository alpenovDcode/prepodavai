import { GenerationType } from '../generations.service';

export interface GenerationRequestParams {
  userId?: string;
  requestedModel?: string;
  generationRequestId: string;
  [key: string]: any;
}

export interface GenerationStrategy {
  /**
   * Проверяет, поддерживает ли эта стратегия данный тип генерации
   * @param type Тип генерации
   */
  supports(type: GenerationType): boolean;

  /**
   * Выполняет генерацию, используя переданные параметры
   * @param params Параметры запроса на генерацию
   */
  generate(params: GenerationRequestParams): Promise<any>;
}
