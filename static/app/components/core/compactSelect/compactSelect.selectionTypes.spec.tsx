import {expectTypeOf} from 'expect-type';
import {CompactSelect, type SelectOption} from './';

describe('CompactSelect', () => {
 describe('types', () => {
it('should enforce correct types for onChange for SingleSelect', () => {
      void (
        <CompactSelect
          value="opt_one"
          onChange={option => {
            expectTypeOf(option).toEqualTypeOf<SelectOption<'opt_one' | 'opt_two'>>();
          }}
          closeOnSelect={option => {
            expectTypeOf(option).toEqualTypeOf<SelectOption<'opt_one' | 'opt_two'>>();
            return true;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );
    });

it('should add undefined to onChange when clearable for SingleSelect', () => {
      void (
        <CompactSelect
          value="opt_one"
          clearable
          onChange={option => {
            expectTypeOf(option).toEqualTypeOf<
              SelectOption<'opt_one' | 'opt_two'> | undefined
            >();
          }}
          closeOnSelect={option => {
            expectTypeOf(option).toEqualTypeOf<
              SelectOption<'opt_one' | 'opt_two'> | undefined
            >();
            return true;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );
    });

it('should always use arrays for MultiSelect', () => {
      const values: Array<'opt_one' | 'opt_two'> = ['opt_one'];
      void (
        <CompactSelect
          value={values}
          multiple
          onChange={option => {
            expectTypeOf(option).toEqualTypeOf<
              Array<SelectOption<'opt_one' | 'opt_two'>>
            >();
          }}
          closeOnSelect={option => {
            expectTypeOf(option).toEqualTypeOf<
              Array<SelectOption<'opt_one' | 'opt_two'>>
            >();
            return true;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );

      void (
        <CompactSelect
          value={values}
          multiple
          clearable
          onChange={option => {
            expectTypeOf(option).toEqualTypeOf<
              Array<SelectOption<'opt_one' | 'opt_two'>>
            >();
          }}
          closeOnSelect={option => {
            expectTypeOf(option).toEqualTypeOf<
              Array<SelectOption<'opt_one' | 'opt_two'>>
            >();
            return true;
          }}
          options={[
            {value: 'opt_one', label: 'Option One'},
            {value: 'opt_two', label: 'Option Two'},
          ]}
        />
      );
    });
 });
});
