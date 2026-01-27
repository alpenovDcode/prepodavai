
import { Test, TestingModule } from '@nestjs/testing';
import { LessonPreparationProcessor } from './lesson-preparation.processor';
import { ConfigService } from '@nestjs/config';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LessonPreparationProcessor', () => {
    let processor: LessonPreparationProcessor;
    let generationHelpers: GenerationHelpersService;

    // Mock Data
    const mockJobData = {
        generationRequestId: 'req-123',
        subject: 'Math',
        topic: 'Algebra',
        level: '9th Grade',
        interests: 'Robots',
        generationTypes: ['lesson_plan', 'quiz'],
    };

    const mockJob = {
        data: mockJobData,
        id: 'job-123',
    } as Job;

    const mockReplicateToken = 'test-token';

    // Mocks using standard Jest mock functions for services
    const mockConfigService = {
        get: jest.fn((key: string) => {
            if (key === 'REPLICATE_API_TOKEN') return mockReplicateToken;
            return null;
        }),
    };

    const mockGenerationHelpers = {
        completeGeneration: jest.fn(),
        failGeneration: jest.fn(),
    };

    const mockPrismaService = {};
    const mockHtmlExportService = {};
    const mockFilesService = {};
    const mockQueue = {
        add: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LessonPreparationProcessor,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: GenerationHelpersService, useValue: mockGenerationHelpers },
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: HtmlExportService, useValue: mockHtmlExportService },
                { provide: FilesService, useValue: mockFilesService },
                { provide: getQueueToken('lesson-preparation'), useValue: mockQueue },
            ],
        }).compile();

        processor = module.get<LessonPreparationProcessor>(LessonPreparationProcessor);
        generationHelpers = module.get<GenerationHelpersService>(GenerationHelpersService);
    });

    it('should be defined', () => {
        expect(processor).toBeDefined();
    });

    describe('process', () => {
        it('should successfully process a job, replace images, and complete generation', async () => {
            // Mock Text Generation Response (Claude)
            const mockTextResponse = {
                data: {
                    status: 'succeeded',
                    output: [
                        '# Lesson Plan\n',
                        'Here is a plan about Algebra and Robots.\n',
                        '[IMAGE: A robot solving an equation]\n',
                        '## Quiz\n',
                        '1. What is x?',
                    ],
                },
            };

            // Mock Image Generation Response (Nano Banana)
            const mockImageResponse = {
                data: {
                    status: 'succeeded',
                    output: ['https://replicate.com/image_output.png'],
                },
            };

            // Setup axios mocks
            mockedAxios.post.mockImplementation((url) => {
                if (url.includes('anthropic/claude-3.5-sonnet')) {
                    return Promise.resolve(mockTextResponse);
                }
                if (url.includes('google/nano-banana')) {
                    return Promise.resolve(mockImageResponse);
                }
                return Promise.reject(new Error('Unknown URL'));
            });

            // Execute
            await processor.process(mockJob);

            // Assertions
            expect(mockedAxios.post).toHaveBeenCalledTimes(2); // 1 text + 1 image

            // Check text generation call args
            const textCallArgs = mockedAxios.post.mock.calls.find(call => call[0].includes('claude'));
            expect(textCallArgs).toBeDefined();
            const textBody = textCallArgs![1] as any;
            expect(textBody.input.prompt).toContain('Subject: Math');
            expect(textBody.input.prompt).toContain('Topic: Algebra');
            expect(textBody.input.prompt).toContain('Robots');

            // Check image generation call args
            const imageCallArgs = mockedAxios.post.mock.calls.find(call => call[0].includes('nano'));
            expect(imageCallArgs).toBeDefined();
            const imageBody = imageCallArgs![1] as any;
            expect(imageBody.input.prompt).toBe('A robot solving an equation');

            // Check completion
            expect(mockGenerationHelpers.completeGeneration).toHaveBeenCalledWith(
                'req-123',
                expect.objectContaining({
                    provider: 'Replicate',
                    mode: 'lessonPreparation',
                    content: expect.stringContaining('<img src="https://replicate.com/image_output.png"'),
                })
            );

            const completeCall = mockGenerationHelpers.completeGeneration.mock.calls[0];
            const outputData = completeCall[1];
            expect(outputData.content).toContain('<h1>Lesson Plan</h1>'); // Markdown to HTML check
        });

        it('should handle text generation failure', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Replicate API Error'));

            await expect(processor.process(mockJob)).rejects.toThrow('Replicate API Error');

            expect(mockGenerationHelpers.failGeneration).toHaveBeenCalledWith(
                'req-123',
                'Replicate API Error'
            );
        });

        it('should handle image generation failure gracefully (keep text)', async () => {
            // Mock Text Generation Response
            const mockTextResponse = {
                data: {
                    status: 'succeeded',
                    output: ['Some text [IMAGE: fail_prompt] end.'],
                },
            };

            mockedAxios.post.mockImplementation((url) => {
                if (url.includes('claude')) return Promise.resolve(mockTextResponse);
                if (url.includes('nano')) return Promise.reject(new Error('Image Gen Error'));
                return Promise.reject(new Error('Unknown'));
            });

            await processor.process(mockJob);

            expect(mockGenerationHelpers.completeGeneration).toHaveBeenCalledWith(
                'req-123',
                expect.objectContaining({
                    // Should replace the tag with error text or keep going, based on implementation.
                    // Implementation says: newContent = newContent.replace(m.full, `(Image generation failed: ${m.prompt})`);
                    content: expect.stringContaining('(Image generation failed: fail_prompt)'),
                })
            );
        });

        it('should poll for prediction if not immediately succeeded', async () => {
            // 1. Initial Pending
            const mockPendingResponse = { data: { id: 'pred-1', status: 'starting' } };
            // 2. Poll Succeeded
            const mockPollResponse = {
                data: {
                    id: 'pred-1',
                    status: 'succeeded',
                    output: ['Polled content']
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockPendingResponse);
            mockedAxios.get.mockResolvedValueOnce(mockPollResponse);

            // Reuse job
            await processor.process(mockJob);

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://api.replicate.com/v1/predictions/pred-1',
                expect.any(Object)
            );

            expect(mockGenerationHelpers.completeGeneration).toHaveBeenCalledWith(
                'req-123',
                expect.objectContaining({
                    content: expect.stringContaining('Polled content'),
                })
            );
        });
    });
});
