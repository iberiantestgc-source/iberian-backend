import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OppositionsService } from './oppositions.service';
import { CreateOppositionDto } from './dto/create-opposition.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('oppositions')
@Controller('oppositions')
export class OppositionsController {
  constructor(private readonly oppositionsService: OppositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las oposiciones activas' })
  findAll() {
    return this.oppositionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una oposición por ID' })
  findOne(@Param('id') id: string) {
    return this.oppositionsService.findOne(id);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Obtener oposición por código (GC, PN...)' })
  findByCode(@Param('code') code: string) {
    return this.oppositionsService.findByCode(code);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nueva oposición (Admin)' })
  create(@Body() dto: CreateOppositionDto) {
    return this.oppositionsService.create(dto);
  }
}
