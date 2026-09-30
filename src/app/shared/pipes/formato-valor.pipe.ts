import { Pipe, PipeTransform } from '@angular/core';

const formatoEntero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const formatoMoneda = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Formato es-CO sin decimales: 1000 => "1.000". */
export function formatoEnteroEsCo(valor: number | null | undefined): string {
  return formatoEntero.format(Number(valor) || 0);
}

/** Formato es-CO con decimales solo si el valor los tiene: 2000 => "2.000", 1500.5 => "1.500,5". */
export function formatoValorEsCo(valor: number | null | undefined): string {
  return formatoMoneda.format(Number(valor) || 0);
}

@Pipe({ name: 'formatoEntero' })
export class FormatoEnteroPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return formatoEnteroEsCo(valor);
  }
}

@Pipe({ name: 'formatoValor' })
export class FormatoValorPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return formatoValorEsCo(valor);
  }
}
