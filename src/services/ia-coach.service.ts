// src/services/ia-coach.service.ts
// =============================================
// SERVICIO IA COACH - VERSIÓN SIMULADA (SIN OPENAI)
// =============================================

import { IACoachInput, IACoachOutput } from '../types/ia-coach.types';

// =============================================
// FUNCIÓN PRINCIPAL: Generar plan de estudio (SIMULADO)
// =============================================
export async function generarPlanEstudio(datos: IACoachInput): Promise<IACoachOutput> {
    console.log('🤖 Generando plan SIMULADO (sin IA)');

    // Calcular días hasta el examen
    const dias = calcularDiasHastaExamen(datos.fechaExamen);

    // Generar un plan simulado
    const plan: IACoachOutput = {
        version: '3.0',
        fechaGeneracion: new Date().toISOString(),
        usuario: {
            fechaExamen: datos.fechaExamen,
            diasHastaExamen: dias,
            horasDiarias: datos.horasDiarias,
            objetivo: datos.objetivo || 'aprobar',
            nivelFatiga: datos.nivelFatiga || 'medio',
            estadoAnimo: datos.estadoAnimo || 'neutro'
        },
        resumen: {
            totalTests: datos.historial.totalTests || 0,
            tasaAcierto: datos.historial.tasaAcierto || 0,
            racha: datos.historial.racha || 0,
            progresoGlobal: 30
        },
        planSemanal: generarPlanSemanal(datos, dias),
        calendario: {
            fases: [
                {
                    nombre: 'Fundamentos',
                    semanas: [1, 2, 3, 4],
                    descripcion: 'Temas 1-8 (prioridad alta)',
                    prioridad: 'alta'
                },
                {
                    nombre: 'Consolidación',
                    semanas: [5, 6, 7, 8],
                    descripcion: 'Temas 9-15 (60% del examen)',
                    prioridad: 'alta'
                },
                {
                    nombre: 'Ampliación',
                    semanas: [9, 10, 11, 12],
                    descripcion: 'Temas 16-22',
                    prioridad: 'media'
                },
                {
                    nombre: 'Cierre',
                    semanas: [13, 14, 15, 16],
                    descripcion: 'Temas 23-30 + repasos intensivos',
                    prioridad: 'baja'
                }
            ],
            hitos: [
                {
                    fecha: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                    descripcion: 'Completar Temas 1-8',
                    completado: false
                },
                {
                    fecha: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
                    descripcion: 'Completar Temas 9-15',
                    completado: false
                },
                {
                    fecha: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
                    descripcion: 'Completar los 30 temas',
                    completado: false
                },
                {
                    fecha: datos.fechaExamen,
                    descripcion: '¡DÍA DEL EXAMEN!',
                    completado: false
                }
            ]
        },
        predicciones: {
            notaEstimada: Math.round((datos.historial.tasaAcierto / 10) * 10) / 10 || 5,
            notaObjetivo: datos.objetivo === 'nota-maxima' ? 9.5 : datos.objetivo === 'nota-alta' ? 8 : 6,
            notaProyectada: Math.round(((datos.historial.tasaAcierto / 10) + 1.5) * 10) / 10 || 6.5,
            probabilidadAprobar: '65%',
            margenMejora: 1.5,
            recomendaciones: [
                'Prioriza los temas con menos dominio en las primeras semanas.',
                'Haz al menos 5 tests al día para mantener la constancia.',
                'Los fines de semana son tu mejor aliado, aprovechalos al máximo.'
            ]
        },
        modoIntensivo: {
            activo: dias < 30,
            diasRestantes: dias,
            recomendaciones: dias < 30 ? [
                'SIMULACRO DIARIO de 80 preguntas cronometradas.',
                'NADA DE TEORÍA NUEVA. Solo repaso de temas ya vistos.'
            ] : [
                'Mantén el ritmo de estudio constante.',
                'Asegúrate de descansar al menos un día a la semana.'
            ]
        },
        analisisPostTest: {
            fallosPorTema: {},
            recomendacionRefuerzo: 'Refuerza los temas con menor dominio.',
            tiempoMejora: 'Practica con cronómetro para mejorar tu velocidad.',
            tendencia: 'estable',
            mensajeFeedback: 'Sigue así, vas por buen camino.'
        },
        testsPersonalizados: [
            {
                tema: datos.temasDificiles?.[0] || 'Tema 1',
                numPreguntas: 20,
                dificultad: 'media',
                motivo: 'Es tu punto débil - refuerzo obligatorio',
                fechaRecomendada: new Date().toISOString().split('T')[0]
            }
        ],
        perfil: {
            principal: 'disciplinado',
            descripcion: 'Opositor modelo. Constante, organizado y con buena actitud.',
            consejos: [
                '🏆 Sigue así. Eres un ejemplo de constancia.',
                '📈 Ahora enfócate en la CALIDAD, no en la cantidad.'
            ],
            recomendaciones: {
                duracionSesiones: datos.horasDiarias >= 5 ? 50 : 35,
                numeroTestsDiarios: datos.horasDiarias >= 5 ? 8 : 4,
                dificultadRecomendada: datos.historial.tasaAcierto > 70 ? 'dificil' : 'media'
            }
        },
        logros: {
            desbloqueados: [],
            siguientes: [
                {
                    nombre: '10 tests',
                    descripcion: 'Completar 10 tests',
                    progreso: `${Math.min(100, Math.round((datos.historial.totalTests / 10) * 100))}%`
                },
                {
                    nombre: 'Racha de 7 días',
                    descripcion: 'Estudiar 7 días seguidos',
                    progreso: `${Math.min(100, Math.round(((datos.historial.racha || 0) / 7) * 100))}%`
                }
            ]
        },
        planB: {
            activo: false,
            motivo: '',
            acciones: []
        },
        rutinasDescanso: {
            diarias: [
                '🧘 Estira el cuello cada 2 horas.',
                '👀 Mira por la ventana 2 minutos para descansar la vista.',
                '💧 Bebe 1 vaso de agua cada hora.'
            ],
            nocturnas: [
                '😴 Dormir 7-8 horas es OBLIGATORIO.',
                '📱 Evitar pantallas 30 min antes de dormir.'
            ]
        },
        recomendacionesMaterial: {
            general: [
                '📚 Manual de Editorial ADAMS para empezar.',
                '📖 Banco de preguntas de InnoTest para practicar.'
            ],
            porArea: {
                psicotecnicos: 'App "Psicotécnicos Guardia Civil" en Google Play.',
                ortografia: 'RAE online (rae.es) para dudas rápidas.',
                verbal: 'Lee el periódico El País o El Mundo. Apunta palabras nuevas.',
                legislacion: 'BOE.es para normativa actualizada.'
            }
        },
        guiasSupervivencia: {
            frustracion: [
                '😤 Respira hondo 3 veces.',
                '📖 Vuelve a un tema que domines.'
            ],
            ansiedad: [
                '😰 Escribe tus miedos en un papel.',
                '🎯 Concéntrate en lo que puedes hacer hoy.'
            ],
            cansancio: [
                '😴 Escucha a tu cuerpo. Descansa hoy, rinde mañana.'
            ],
            motivacion: [
                '🔥 Aprovecha esta energía. Haz un simulacro completo.'
            ]
        },
        mensajesMotivacion: [
            '💪 Tú puedes con todo. Cada día es un paso más hacia tu meta.',
            '🔥 La constancia es el camino. No te rindas ahora.',
            '📈 Cada test que haces es un paso más cerca de tu plaza.',
            '🏆 El éxito no es no fallar, es levantarse después de cada fallo.',
            '🌟 Eres más fuerte de lo que crees. Sigue adelante.'
        ],
        alertas: [
            {
                nivel: 'info',
                mensaje: '📚 Mantén la constancia diaria.',
                accion: 'Intenta estudiar al menos 1 hora todos los días.'
            }
        ],
        ultimaActualizacion: new Date().toISOString()
    };

    return plan;
}

// =============================================
// FUNCIÓN AUXILIAR: Generar plan semanal
// =============================================
function generarPlanSemanal(datos: IACoachInput, dias: number): any[] {
    const semanas = Math.ceil(dias / 7);
    const planSemanal = [];
    const temas = Object.keys(datos.porcentajeDominio || {});
    const temasOrdenados = temas.sort((a, b) =>
        (datos.porcentajeDominio[a] || 0) - (datos.porcentajeDominio[b] || 0)
    );

    for (let i = 0; i < Math.min(semanas, 16); i++) {
        const semana = i + 1;
        const temaIndex = i % Math.max(temasOrdenados.length, 1);
        const tema = temasOrdenados[temaIndex] || `Tema ${semana}`;

        planSemanal.push({
            semana: semana,
            fechaInicio: new Date(Date.now() + i * 7 * 86400000).toISOString().split('T')[0],
            fechaFin: new Date(Date.now() + (i + 1) * 7 * 86400000).toISOString().split('T')[0],
            objetivoSemana: `Completar ${tema} y hacer ${50 + i * 10} tests`,
            metaTests: 50 + i * 10,
            metaHoras: Math.round(datos.horasDiarias * 7 * (0.8 + i * 0.02)),
            dias: [
                {
                    dia: 'Lunes',
                    fecha: new Date(Date.now() + i * 7 * 86400000).toISOString().split('T')[0],
                    metaHoras: datos.horasDiarias,
                    descanso: false,
                    sesiones: [
                        {
                            hora: '09:00',
                            duracion: 60,
                            actividad: 'teoria',
                            tema: tema,
                            descripcion: `Estudiar ${tema} completamente`,
                            objetivo: `Comprender los conceptos clave de ${tema}`
                        }
                    ],
                    rutinaDescanso: '🧘 Estira el cuello cada 2 horas.'
                },
                {
                    dia: 'Martes',
                    fecha: new Date(Date.now() + (i * 7 + 1) * 86400000).toISOString().split('T')[0],
                    metaHoras: datos.horasDiarias,
                    descanso: false,
                    sesiones: [
                        {
                            hora: '09:00',
                            duracion: 45,
                            actividad: 'tests',
                            tema: tema,
                            descripcion: `20 tests de ${tema}`,
                            objetivo: `Afianzar conocimientos de ${tema}`
                        }
                    ],
                    rutinaDescanso: '👀 Mira por la ventana 2 minutos para descansar la vista.'
                },
                {
                    dia: 'Miércoles',
                    fecha: new Date(Date.now() + (i * 7 + 2) * 86400000).toISOString().split('T')[0],
                    metaHoras: datos.horasDiarias,
                    descanso: false,
                    sesiones: [
                        {
                            hora: '09:00',
                            duracion: 45,
                            actividad: 'psicotecnicos',
                            tema: 'Psicotécnicos',
                            descripcion: 'Practicar psicotécnicos con 5 min menos',
                            objetivo: 'Mejorar velocidad en psicotécnicos'
                        }
                    ],
                    rutinaDescanso: '💧 Bebe 1 vaso de agua cada hora.'
                }
            ]
        });
    }

    return planSemanal;
}

// =============================================
// FUNCIÓN AUXILIAR: Calcular días hasta el examen
// =============================================
function calcularDiasHastaExamen(fechaExamen: string): number {
    const hoy = new Date();
    const examen = new Date(fechaExamen);
    const diff = examen.getTime() - hoy.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// =============================================
// FUNCIÓN AUXILIAR: Guardar plan
// =============================================
export async function guardarPlan(uid: string, plan: IACoachOutput): Promise<void> {
    console.log(`📝 Plan guardado (simulado) para usuario: ${uid}`);
}

// =============================================
// FUNCIÓN AUXILIAR: Obtener plan
// =============================================
export async function obtenerPlan(uid: string): Promise<IACoachOutput | null> {
    console.log(`📊 Obteniendo plan para usuario: ${uid}`);
    return null;
}