// src/types/ia-coach.types.ts
// =============================================
// TIPOS PARA EL SERVICIO DE IA COACH
// =============================================

// =============================================
// ENTRADA: Datos que recibe la IA
// =============================================
export interface IACoachInput {
  // Datos del usuario
  fechaExamen: string;
  horasDiarias: number;
  diasDescanso?: string[];
  temasDificiles?: string[];
  tiempoEstudiando?: string;
  objetivo?: 'aprobar' | 'nota-alta' | 'nota-maxima';
  nivelFatiga?: 'bajo' | 'medio' | 'alto';
  dispositivo?: string;
  porcentajeDominio: Record<string, number>;
  mensajeUsuario?: string;

  // Historial (calculado por la app)
  historial: {
    totalTests: number;
    tasaAcierto: number;
    promedioHoras: number;
    temasMasFallados?: string[];
    temasMasAcertados?: string[];
    tendencia?: 'mejorando' | 'estable' | 'empeorando';
    nivelCompromiso?: 'bajo' | 'medio' | 'alto';
    ritmoEstudio?: 'principiante' | 'constante' | 'intenso' | 'excepcional';
    ultimaSemana?: { tests: number; aciertos: number };
    racha?: number;
  };

  // Estado de ánimo
  estadoAnimo?: 'motivado' | 'cansado' | 'frustrado' | 'ansioso' | 'neutro';
  tendenciaEmocional?: 'mejorando' | 'estable' | 'empeorando';
  estadosRecientes?: string[];
}

// =============================================
// SALIDA: Plan generado por la IA
// =============================================
export interface IACoachOutput {
  version: string;
  fechaGeneracion: string;
  usuario: {
    nombre?: string;
    fechaExamen: string;
    diasHastaExamen: number;
    horasDiarias: number;
    objetivo: string;
    nivelFatiga: string;
    estadoAnimo: string;
  };
  resumen: {
    totalTests: number;
    tasaAcierto: number;
    racha: number;
    progresoGlobal: number;
  };
  planSemanal: PlanSemanal[];
  calendario: {
    fases: FaseEstudio[];
    hitos: HitoEstudio[];
  };
  predicciones: Predicciones;
  modoIntensivo: {
    activo: boolean;
    diasRestantes: number;
    recomendaciones: string[];
  };
  analisisPostTest: {
    fallosPorTema: Record<string, number>;
    recomendacionRefuerzo: string;
    tiempoMejora: string;
    tendencia: string;
    mensajeFeedback: string;
  };
  testsPersonalizados: TestPersonalizado[];
  perfil: {
    principal: string;
    descripcion: string;
    consejos: string[];
    recomendaciones: {
      duracionSesiones: number;
      numeroTestsDiarios: number;
      dificultadRecomendada: 'facil' | 'media' | 'dificil';
    };
  };
  logros: {
    desbloqueados: Logro[];
    siguientes: LogroProgreso[];
  };
  planB: {
    activo: boolean;
    motivo: string;
    acciones: string[];
  };
  rutinasDescanso: {
    diarias: string[];
    nocturnas: string[];
  };
  recomendacionesMaterial: {
    general: string[];
    porArea: {
      psicotecnicos: string;
      ortografia: string;
      verbal: string;
      legislacion: string;
    };
  };
  guiasSupervivencia: {
    frustracion: string[];
    ansiedad: string[];
    cansancio: string[];
    motivacion: string[];
  };
  mensajesMotivacion: string[];
  alertas: Alerta[];
  ultimaActualizacion: string;
}

// =============================================
// SUBTIPOS
// =============================================
export interface PlanSemanal {
  semana: number;
  fechaInicio?: string;
  fechaFin?: string;
  objetivoSemana: string;
  metaTests: number;
  metaHoras: number;
  dias: DiaEstudio[];
}

export interface DiaEstudio {
  dia: string;
  fecha: string;
  metaHoras: number;
  descanso: boolean;
  sesiones: SesionEstudio[];
  rutinaDescanso?: string;
}

export interface SesionEstudio {
  hora: string;
  duracion: number;
  actividad: 'teoria' | 'tests' | 'simulacro' | 'repaso' | 'psicotecnicos' | 'ortografia' | 'verbal';
  tema?: string;
  descripcion: string;
  objetivo: string;
  completado?: boolean;
}

export interface FaseEstudio {
  nombre: string;
  semanas: number[];
  descripcion: string;
  prioridad: 'alta' | 'media' | 'baja';
}

export interface HitoEstudio {
  fecha: string;
  descripcion: string;
  completado: boolean;
}

export interface Predicciones {
  notaEstimada: number;
  notaObjetivo: number;
  notaProyectada: number;
  probabilidadAprobar: string;
  margenMejora: number;
  recomendaciones: string[];
}

export interface TestPersonalizado {
  tema: string;
  numPreguntas: number;
  dificultad: 'facil' | 'media' | 'dificil';
  motivo: string;
  fechaRecomendada: string;
}

export interface Logro {
  nombre: string;
  descripcion: string;
  fecha: string;
}

export interface LogroProgreso {
  nombre: string;
  descripcion: string;
  progreso: string;
}

export interface Alerta {
  nivel: 'info' | 'warning' | 'danger' | 'success';
  mensaje: string;
  accion?: string;
}