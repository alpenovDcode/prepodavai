import { Controller, Post, Body } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('generate-photosession')
export class PhotosessionController {
    constructor(private readonly webhooksService: WebhooksService) { }

    @Post()
    async handleCallback(@Body() body: any) {
        return this.webhooksService.handlePhotosessionCallback(body);
    }
}
